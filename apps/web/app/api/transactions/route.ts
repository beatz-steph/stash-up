import { apiSuccess, apiError } from "@/lib/api/response"
import { getSession } from "@/lib/session"
import { decodeCursor, encodeCursor } from "@/lib/api/cursor"
import { prisma, Prisma } from "@workspace/db"
import type { TransactionItem, TransactionListRes } from "./dto/transaction.dto"

/**
 * A user's money events across all their circles: contributions they funded
 * (InboundTransfer into their VAs) and payouts they received. Merged, newest
 * first. `?limit=` caps the result (default 50, max 100). `?cursor=` pages
 * through both underlying sources — see lib/api/cursor.ts for why offset
 * pagination doesn't work for a merged two-source feed.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return apiError("Unauthorized", 401)
  }
  const userId = session.user.id

  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100)
  const cursor = decodeCursor(url.searchParams.get("cursor"))

  // Fetch limit+1 from each source so we can tell whether more rows remain
  // after the merge/slice (a source could contribute 0 items to the final
  // page yet still have more rows waiting behind the cursor).
  const fetchCount = limit + 1

  // cursor.id is the PREFIXED merged-feed id (e.g. "out_p4" or "in_aaa"), not
  // a raw per-table id — InboundTransfer and Payout ids are independent cuid
  // sequences, so a raw id from one table means nothing against the other
  // table's id column. The merge-sort tiebreaker below orders equal-
  // timestamp rows by their prefixed id descending, and since "out_" > "in_"
  // lexically, that means: at a tied timestamp, ALL payouts sort before ALL
  // contributions. So when resuming from a cursor at a tie:
  //   - cursor is "out_X"  -> payouts:      still need id < X (raw compare)
  //                         -> contributions: none were emitted yet, take all
  //   - cursor is "in_X"   -> contributions: still need id < X (raw compare)
  //                         -> payouts:      ALL of them already preceded the
  //                                          cursor in the merge, exclude all
  const cursorIsPayout = cursor?.id.startsWith("out_") ?? false
  const cursorIsContribution = cursor?.id.startsWith("in_") ?? false
  const cursorRawId = cursor ? (cursorIsPayout ? cursor.id.slice(4) : cursor.id.slice(3)) : null

  const inboundCursorFilter: Prisma.InboundTransferWhereInput = cursor
    ? {
        OR: [
          { receivedAt: { lt: new Date(cursor.createdAt) } },
          // At the tie timestamp: if the cursor is a contribution, only take
          // rows with a strictly smaller id (mirrors the merge tiebreak); if
          // the cursor is a payout, every contribution at that timestamp is
          // still eligible (none were emitted on the previous page yet), so
          // include the whole tie with no id restriction.
          cursorIsContribution
            ? { receivedAt: new Date(cursor.createdAt), id: { lt: cursorRawId! } }
            : { receivedAt: new Date(cursor.createdAt) },
        ],
      }
    : {}

  const payoutCursorFilter: Prisma.PayoutWhereInput = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          // Mirror image: if the cursor is a payout, only take rows with a
          // strictly smaller id. If the cursor is a contribution, every
          // payout at that timestamp already preceded it in the merge (see
          // comment above `cursorIsPayout`), so exclude the tie entirely —
          // expressed as an always-false clause (id in an empty set) rather
          // than omitting the OR branch, so the `OR` shape stays consistent.
          cursorIsPayout
            ? { createdAt: new Date(cursor.createdAt), id: { lt: cursorRawId! } }
            : { createdAt: new Date(cursor.createdAt), id: { in: [] } },
        ],
      }
    : {}

  const [inbound, payouts] = await Promise.all([
    prisma.inboundTransfer.findMany({
      where: { virtualAccount: { membership: { userId } }, ...inboundCursorFilter },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: fetchCount,
      select: {
        id: true,
        amountMinor: true,
        matchStatus: true,
        receivedAt: true,
        matchedCycle: { select: { sequence: true } },
        virtualAccount: {
          select: { membership: { select: { circle: { select: { id: true, name: true } } } } },
        },
      },
    }),
    prisma.payout.findMany({
      where: { recipientMembership: { userId }, ...payoutCursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: fetchCount,
      select: {
        id: true,
        amountMinor: true,
        status: true,
        createdAt: true,
        cycle: { select: { sequence: true, circle: { select: { id: true, name: true } } } },
      },
    }),
  ])

  const contributions: TransactionItem[] = inbound.map((t) => ({
    id: `in_${t.id}`,
    kind: "CONTRIBUTION",
    amountMinor: t.amountMinor,
    circleId: t.virtualAccount.membership.circle.id,
    circleName: t.virtualAccount.membership.circle.name,
    cycleSequence: t.matchedCycle?.sequence ?? null,
    status: t.matchStatus,
    createdAt: t.receivedAt.toISOString(),
  }))

  const received: TransactionItem[] = payouts.map((p) => ({
    id: `out_${p.id}`,
    kind: "PAYOUT",
    amountMinor: p.amountMinor,
    circleId: p.cycle.circle.id,
    circleName: p.cycle.circle.name,
    cycleSequence: p.cycle.sequence,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }))

  // Tiebreak on the prefixed merged-feed id ("in_"/"out_") — this exact
  // comparator is mirrored by the per-source cursor filters above, which is
  // what makes the tie-handling correct across a page boundary.
  const merged = [...contributions, ...received].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return a.id < b.id ? 1 : -1
  })

  const hasMore = merged.length > limit
  const items = merged.slice(0, limit)

  let nextCursor: string | null = null
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]!
    // Keep the prefix in the persisted cursor id — the per-source filters
    // above need it to know which source's tie-clause to apply.
    nextCursor = encodeCursor({ createdAt: last.createdAt, id: last.id })
  }

  return apiSuccess<TransactionListRes>({ items, nextCursor })
}

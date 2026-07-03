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

  // cursor.id is the PREFIXED merged-feed id (e.g. "out_p4"), not a raw
  // per-table id — InboundTransfer and Payout ids come from independent cuid
  // sequences, so comparing a raw id from one table against the other's id
  // column is meaningless and would corrupt the equal-timestamp tiebreak
  // whenever the page boundary lands on a tie between the two sources.
  // Deriving the same "in_"/"out_" prefixed string and comparing it against
  // each row's own prefixed id keeps the per-source filter consistent with
  // the merge-sort tiebreaker below (same comparator, same total order).
  const inboundCursorFilter: Prisma.InboundTransferWhereInput = cursor
    ? {
        OR: [
          { receivedAt: { lt: new Date(cursor.createdAt) } },
          {
            receivedAt: new Date(cursor.createdAt),
            // Only exclude rows whose prefixed id isn't lexically before the
            // cursor — Prisma can't compare a computed string, so widen to
            // "id < cursor's raw id" ONLY when the cursor also belongs to
            // this source; otherwise (cursor belongs to the other source) a
            // tie is fully excluded/included by prefix ("in_" < "out_"),
            // handled by the JS post-filter below via mergeKey.
            id: cursor.id.startsWith("in_") ? { lt: cursor.id.slice(3) } : undefined,
          },
        ],
      }
    : {}

  const payoutCursorFilter: Prisma.PayoutWhereInput = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          {
            createdAt: new Date(cursor.createdAt),
            id: cursor.id.startsWith("out_") ? { lt: cursor.id.slice(4) } : undefined,
          },
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

  // Secondary sort by the source-local db id (both `in_<id>`/`out_<id>` are
  // cuids — fine as a tiebreaker string compare within the merge; the actual
  // cursor persisted below strips the prefix so it round-trips against the
  // correct source's `id` column on the next page).
  const merged = [...contributions, ...received].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return a.id < b.id ? 1 : -1
  })

  const hasMore = merged.length > limit
  const items = merged.slice(0, limit)

  let nextCursor: string | null = null
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]!
    const lastId = last.id.startsWith("in_") ? last.id.slice(3) : last.id.slice(4)
    nextCursor = encodeCursor({ createdAt: last.createdAt, id: lastId })
  }

  return apiSuccess<TransactionListRes>({ items, nextCursor })
}

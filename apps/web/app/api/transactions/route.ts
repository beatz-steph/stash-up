import { apiSuccess, apiError } from "@/lib/api/response"
import { getSession } from "@/lib/session"
import { decodeCursor, encodeCursor } from "@/lib/api/cursor"
import { prisma, Prisma } from "@workspace/db"
import { walletSourceLabel } from "@/lib/wallet/labels"
import type { TransactionItem, TransactionListRes } from "./dto/transaction.dto"

/**
 * A user's money events: circle contributions they funded (InboundTransfer into
 * their VAs), payouts they received, and wallet ledger movements (top-ups,
 * withdrawals, credits). Merged, newest first. `?limit=` caps the result
 * (default 50, max 100). `?cursor=` pages through all three underlying sources —
 * see lib/api/cursor.ts for why offset pagination doesn't work for a merged feed.
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
  // Three merged sources ranked by their id prefix (lexical, descending):
  // "wal_" > "out_" > "in_". At a tied timestamp the merge emits wallet, then
  // payouts, then contributions — so when resuming from a cursor at that tie,
  // for each source S vs the cursor's source C:
  //   rank(S) > rank(C) → all of S already emitted → exclude the whole tie
  //   rank(S) = rank(C) → still need id < cursorRawId (raw same-table compare)
  //   rank(S) < rank(C) → none of S emitted yet → include the whole tie
  const cursorIsPayout = cursor?.id.startsWith("out_") ?? false
  const cursorIsWallet = cursor?.id.startsWith("wal_") ?? false
  const cursorIsContribution = cursor?.id.startsWith("in_") ?? false
  // Prefix lengths: "in_" = 3, "out_"/"wal_" = 4.
  const cursorRawId = cursor ? cursor.id.slice(cursorIsContribution ? 3 : 4) : null

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
          // Payout rank sits between wallet (higher) and contribution (lower):
          //   cursor is payout   → same source, take id < cursorRawId
          //   cursor is wallet   → payouts not yet emitted at the tie, take all
          //   cursor is contribution → payouts already emitted, exclude the tie
          cursorIsPayout
            ? { createdAt: new Date(cursor.createdAt), id: { lt: cursorRawId! } }
            : cursorIsWallet
              ? { createdAt: new Date(cursor.createdAt) }
              : { createdAt: new Date(cursor.createdAt), id: { in: [] } },
        ],
      }
    : {}

  const walletCursorFilter: Prisma.WalletLedgerEntryWhereInput = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          // Wallet has the highest rank, so any non-wallet cursor means every
          // wallet row at the tie was already emitted → exclude the tie.
          cursorIsWallet
            ? { createdAt: new Date(cursor.createdAt), id: { lt: cursorRawId! } }
            : { createdAt: new Date(cursor.createdAt), id: { in: [] } },
        ],
      }
    : {}

  const [inbound, payouts, walletEntries] = await Promise.all([
    prisma.inboundTransfer.findMany({
      where: { virtualAccount: { membership: { userId } }, ...inboundCursorFilter },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: fetchCount,
      select: {
        id: true,
        amountMinor: true,
        matchStatus: true,
        receivedAt: true,
        matchedCycle: { select: { sequence: true, circle: { select: { id: true, name: true } } } },
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
    prisma.walletLedgerEntry.findMany({
      where: { wallet: { userId }, ...walletCursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: fetchCount,
      select: {
        id: true,
        direction: true,
        amountMinor: true,
        source: true,
        createdAt: true,
      },
    }),
  ])

  const contributions: TransactionItem[] = inbound.map((t) => ({
    id: `in_${t.id}`,
    kind: "CONTRIBUTION",
    amountMinor: t.amountMinor,
    // Card contributions have no VA — fall back to the matched cycle's circle.
    circleId: t.virtualAccount?.membership?.circle.id ?? t.matchedCycle?.circle.id ?? "",
    circleName: t.virtualAccount?.membership?.circle.name ?? t.matchedCycle?.circle.name ?? "",
    cycleSequence: t.matchedCycle?.sequence ?? null,
    status: t.matchStatus,
    createdAt: t.receivedAt.toISOString(),
    direction: null,
    label: null,
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
    direction: null,
    label: null,
  }))

  const wallet: TransactionItem[] = walletEntries.map((e) => ({
    id: `wal_${e.id}`,
    kind: "WALLET",
    amountMinor: e.amountMinor,
    circleId: "", // wallet movements aren't circle-scoped
    circleName: "",
    cycleSequence: null,
    status: "",
    createdAt: e.createdAt.toISOString(),
    direction: e.direction,
    label: walletSourceLabel(e.source),
  }))

  // Tiebreak on the prefixed merged-feed id ("in_"/"out_") — this exact
  // comparator is mirrored by the per-source cursor filters above, which is
  // what makes the tie-handling correct across a page boundary.
  const merged = [...contributions, ...received, ...wallet].sort((a, b) => {
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

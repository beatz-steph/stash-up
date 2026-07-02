import { apiSuccess, apiError } from "@/lib/api/response"
import { getSession } from "@/lib/session"
import { prisma } from "@workspace/db"
import type { TransactionItem, TransactionListRes } from "./dto/transaction.dto"

/**
 * A user's money events across all their circles: contributions they funded
 * (InboundTransfer into their VAs) and payouts they received. Merged, newest
 * first. `?limit=` caps the result (default 50, max 100).
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return apiError("Unauthorized", 401)
  }
  const userId = session.user.id

  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100)

  const [inbound, payouts] = await Promise.all([
    prisma.inboundTransfer.findMany({
      where: { virtualAccount: { membership: { userId } } },
      orderBy: { receivedAt: "desc" },
      take: limit,
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
      where: { recipientMembership: { userId } },
      orderBy: { createdAt: "desc" },
      take: limit,
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

  const items = [...contributions, ...received]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit)

  return apiSuccess<TransactionListRes>({ items })
}

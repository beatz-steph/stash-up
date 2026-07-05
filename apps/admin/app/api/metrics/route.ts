import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { metricsResponseSchema } from "./dto/metrics.dto"

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const [
      totalUsers,
      blockedUsers,
      formingCircles,
      activeCircles,
      completedCircles,
      cancelledCircles,
      openCycles,
      collectingCycles,
      awaitingResolutionCycles,
      readyToPayoutCycles,
      payoutInitiatedCycles,
      paidOutCycles,
      closedCycles,
      cancelledCycles,
      reconciliationBacklog,
      pendingOrphans,
      failedPayouts,
      inboundAgg,
      payoutAgg,
      walletAgg,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { blockedFromCircles: true } }),
      prisma.circle.count({ where: { status: "FORMING" } }),
      prisma.circle.count({ where: { status: "ACTIVE" } }),
      prisma.circle.count({ where: { status: "COMPLETED" } }),
      prisma.circle.count({ where: { status: "CANCELLED" } }),
      prisma.cycle.count({ where: { status: "OPEN" } }),
      prisma.cycle.count({ where: { status: "COLLECTING" } }),
      prisma.cycle.count({ where: { status: "AWAITING_RESOLUTION" } }),
      prisma.cycle.count({ where: { status: "READY_TO_PAYOUT" } }),
      prisma.cycle.count({ where: { status: "PAYOUT_INITIATED" } }),
      prisma.cycle.count({ where: { status: "PAID_OUT" } }),
      prisma.cycle.count({ where: { status: "CLOSED" } }),
      prisma.cycle.count({ where: { status: "CANCELLED" } }),
      // Backlog = genuinely unattributable webhooks only (matches the recon
      // queue). Under/over-payments are auto-handled; MANUAL is resolved.
      prisma.inboundTransfer.count({ where: { matchStatus: "UNMATCHED" } }),
      prisma.orphanTransaction.count({ where: { status: "PENDING" } }),
      prisma.payout.count({ where: { status: "FAILED" } }),
      // Money in = every recorded inbound transfer; out = successful payouts.
      prisma.inboundTransfer.aggregate({ _count: { _all: true }, _sum: { amountMinor: true } }),
      prisma.payout.aggregate({
        where: { status: "SUCCESS" },
        _count: { _all: true },
        _sum: { amountMinor: true },
      }),
      // Wallet liabilities = money we hold on users' behalf in the shared
      // sub-account. Part of the recon identity (available ≥ pots + buffers + wallets).
      prisma.walletAccount.aggregate({ _count: { _all: true }, _sum: { balanceMinor: true } }),
    ])

    const data = {
      users: { total: totalUsers, blocked: blockedUsers },
      circles: {
        forming: formingCircles,
        active: activeCircles,
        completed: completedCircles,
        cancelled: cancelledCircles,
      },
      cycles: {
        open: openCycles,
        collecting: collectingCycles,
        awaitingResolution: awaitingResolutionCycles,
        readyToPayout: readyToPayoutCycles,
        payoutInitiated: payoutInitiatedCycles,
        paidOut: paidOutCycles,
        closed: closedCycles,
        cancelled: cancelledCycles,
      },
      needsAttention: {
        reconciliationBacklog,
        pendingOrphans,
        failedPayouts,
        awaitingResolutionCycles,
      },
      transactions: {
        inbound: {
          count: inboundAgg._count._all,
          valueMinor: inboundAgg._sum.amountMinor ?? 0,
        },
        outbound: {
          count: payoutAgg._count._all,
          valueMinor: payoutAgg._sum.amountMinor ?? 0,
        },
      },
      wallet: {
        accounts: walletAgg._count._all,
        liabilitiesMinor: walletAgg._sum.balanceMinor ?? 0,
      },
    }

    return NextResponse.json(metricsResponseSchema.parse(data))
  } catch (err) {
    console.error("Failed to fetch metrics:", err)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

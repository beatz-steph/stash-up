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
      failedPayouts,
      cyclesAggregation,
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
      prisma.inboundTransfer.count({ where: { matchStatus: { not: "MATCHED" } } }),
      prisma.payout.count({ where: { status: "FAILED" } }),
      prisma.cycle.aggregate({ _sum: { potCollectedMinor: true } }),
    ])

    const totalCollectedMinor = cyclesAggregation._sum.potCollectedMinor ?? 0

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
        failedPayouts,
        awaitingResolutionCycles,
      },
      financials: {
        totalCollectedMinor,
      },
    }

    return NextResponse.json(metricsResponseSchema.parse(data))
  } catch (err) {
    console.error("Failed to fetch metrics:", err)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

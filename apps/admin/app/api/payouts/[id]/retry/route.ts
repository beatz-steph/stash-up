import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"
import { recordAudit } from "@/lib/audit"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSuperAdmin()
  if (error) return error

  const payoutId = (await params).id

  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    select: { id: true, cycleId: true }
  })

  if (!payout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 })
  }

  await recordAudit({
    adminUserId: session.user.id,
    action: "PAYOUT_RETRY_REQUESTED",
    entityType: "Payout",
    entityId: payoutId,
    metadata: {
      cycleId: payout.cycleId,
      payoutId: payout.id,
      note: "Intent recorded. Engine re-trigger pending manual operation."
    },
  })

  return NextResponse.json({ ok: true })
}

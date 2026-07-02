import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"
import { validateRequestBody } from "@/lib/api/validate"
import { ResolveTransferReqSchema } from "./dto/resolve-transfer.dto"
import { recordAudit } from "@/lib/audit"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSuperAdmin()
  if (error) return error

  const validation = await validateRequestBody(req, ResolveTransferReqSchema)
  if (!validation.success) {
    return validation.errorResponse
  }

  const transferId = (await params).id
  const { matchedCycleId, matchedMembershipId } = validation.data

  const transfer = await prisma.inboundTransfer.findUnique({
    where: { id: transferId },
    select: { matchStatus: true }
  })

  if (!transfer) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 })
  }

  // Integrity Check
  if (matchedMembershipId && matchedCycleId) {
    const cycle = await prisma.cycle.findUnique({
      where: { id: matchedCycleId },
      include: { circle: { include: { memberships: true } } }
    })

    if (!cycle) {
      return NextResponse.json({ error: "Cycle not found" }, { status: 404 })
    }

    const membershipBelongsToCircle = cycle.circle.memberships.some(m => m.id === matchedMembershipId)
    if (!membershipBelongsToCircle) {
      return NextResponse.json({ error: "Membership does not belong to the cycle's circle" }, { status: 400 })
    }
  }

  const updatedTransfer = await prisma.inboundTransfer.update({
    where: { id: transferId },
    data: {
      matchStatus: "MANUAL",
      matchedCycleId: matchedCycleId ?? null,
      matchedMembershipId: matchedMembershipId ?? null,
    },
  })

  await recordAudit({
    adminUserId: session.user.id,
    action: "TRANSFER_RESOLVED",
    entityType: "InboundTransfer",
    entityId: transferId,
    metadata: {
      from: { matchStatus: transfer.matchStatus },
      to: { matchStatus: "MANUAL", matchedCycleId, matchedMembershipId }
    },
  })

  // Return only safe fields — the full row contains the unmasked sender account number.
  return NextResponse.json({
    data: {
      id: updatedTransfer.id,
      matchStatus: updatedTransfer.matchStatus,
      matchedCycleId: updatedTransfer.matchedCycleId,
      matchedMembershipId: updatedTransfer.matchedMembershipId,
    },
  })
}

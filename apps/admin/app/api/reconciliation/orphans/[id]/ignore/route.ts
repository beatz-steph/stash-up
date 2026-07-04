import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"
import { validateRequestBody } from "@/lib/api/validate"
import { ignoreOrphanReqSchema } from "../../dto/orphan.dto"
import { recordAudit } from "@/lib/audit"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSuperAdmin()
  if (error) return error

  const validation = await validateRequestBody(req, ignoreOrphanReqSchema)
  if (!validation.success) return validation.errorResponse

  const { id } = await params
  const { note } = validation.data

  const orphan = await prisma.orphanTransaction.findUnique({
    where: { id },
    select: { status: true },
  })
  if (!orphan) return NextResponse.json({ error: "Orphan not found" }, { status: 404 })
  if (orphan.status !== "PENDING") {
    return NextResponse.json({ error: "Orphan is not pending" }, { status: 409 })
  }

  await prisma.orphanTransaction.update({
    where: { id },
    data: {
      status: "IGNORED",
      resolvedByAdminId: session.user.id,
      resolvedAt: new Date(),
      resolutionNote: note,
    },
  })

  await recordAudit({
    adminUserId: session.user.id,
    action: "ORPHAN_IGNORED",
    entityType: "OrphanTransaction",
    entityId: id,
    metadata: { note },
  })

  return NextResponse.json({ data: { id, status: "IGNORED" } })
}

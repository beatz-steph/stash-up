import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"
import { validateRequestBody } from "@/lib/api/validate"
import { BlockUserReqSchema } from "./dto/block-user.dto"
import { recordAudit } from "@/lib/audit"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireSuperAdmin()
  if (error) return error

  const validation = await validateRequestBody(req, BlockUserReqSchema)
  if (!validation.success) {
    return validation.errorResponse
  }

  const userId = (await params).id
  const { blocked } = validation.data

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { blockedFromCircles: true }
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { blockedFromCircles: blocked },
  })

  await recordAudit({
    adminUserId: session.user.id,
    action: blocked ? "USER_BLOCKED" : "USER_UNBLOCKED",
    entityType: "User",
    entityId: userId,
    metadata: {
      from: { blockedFromCircles: user.blockedFromCircles },
      to: { blockedFromCircles: blocked }
    },
  })

  return NextResponse.json({
    data: { id: updatedUser.id, blockedFromCircles: updatedUser.blockedFromCircles },
  })
}

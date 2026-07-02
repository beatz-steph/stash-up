import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"
import { validateRequestBody } from "@/lib/api/validate"
import { ToggleConfigReqSchema } from "./dto/toggle-config.dto"
import { recordAudit } from "@/lib/audit"

export async function POST(req: Request) {
  const { session, error } = await requireSuperAdmin()
  if (error) return error

  const validation = await validateRequestBody(req, ToggleConfigReqSchema)
  if (!validation.success) {
    return validation.errorResponse
  }

  const { status } = validation.data

  const currentConfig = await prisma.nombaConfig.findFirst()

  if (!currentConfig) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 })
  }

  const updatedConfig = await prisma.nombaConfig.update({
    where: { id: currentConfig.id },
    data: { status },
  })

  await recordAudit({
    adminUserId: session.user.id,
    action: "NOMBA_CONFIG_TOGGLED",
    entityType: "NombaConfig",
    entityId: updatedConfig.id,
    metadata: {
      from: { status: currentConfig.status },
      to: { status: updatedConfig.status }
    },
  })

  // Return only safe fields — the full row contains the secret ciphers.
  return NextResponse.json({ data: { id: updatedConfig.id, status: updatedConfig.status } })
}

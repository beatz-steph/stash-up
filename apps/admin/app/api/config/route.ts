import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"
import { configResponseSchema } from "./dto/config.dto"

export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  // Assume there is only one active config or we fetch the latest one
  const config = await prisma.nombaConfig.findFirst({
    orderBy: { createdAt: "desc" },
  })

  if (!config) {
    return NextResponse.json({ error: "Configuration not found" }, { status: 404 })
  }

  // Mask clientId
  const clientId = config.clientId
  let maskedClientId = clientId
  if (clientId.length > 8) {
    maskedClientId = `${clientId.slice(0, 4)}••••${clientId.slice(-4)}`
  } else if (clientId.length > 4) {
    maskedClientId = `••••${clientId.slice(-4)}`
  }

  const response = {
    id: config.id,
    provider: config.provider,
    baseUrl: config.baseUrl,
    status: config.status,
    clientId: maskedClientId,
    updatedAt: config.updatedAt,
  }

  return NextResponse.json(configResponseSchema.parse(response))
}

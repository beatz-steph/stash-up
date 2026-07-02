import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { paginationSchema, auditListResponseSchema } from "./dto/audit.dto"

export async function GET(req: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const url = new URL(req.url)
  const queryParams = Object.fromEntries(url.searchParams.entries())
  
  const parsed = paginationSchema.safeParse(queryParams)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
  }

  const { page, limit } = parsed.data

  const [audits, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        adminUser: {
          select: { name: true },
        },
      },
    }),
    prisma.adminAuditLog.count(),
  ])

  const response = {
    items: audits.map((a) => ({
      id: a.id,
      adminUserId: a.adminUserId,
      adminName: a.adminUser.name,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: a.metadata,
      createdAt: a.createdAt,
    })),
    total,
    page,
    limit,
  }

  return NextResponse.json(auditListResponseSchema.parse(response))
}

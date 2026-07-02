import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { paginationSchema, webhookListResponseSchema } from "./dto/webhooks.dto"

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

  const [webhooks, total] = await Promise.all([
    prisma.webhookReceipt.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        providerEventId: true,
        eventType: true,
        signatureValid: true,
        processed: true,
        processingError: true,
        createdAt: true,
      },
    }),
    prisma.webhookReceipt.count(),
  ])

  const response = {
    items: webhooks,
    total,
    page,
    limit,
  }

  return NextResponse.json(webhookListResponseSchema.parse(response))
}

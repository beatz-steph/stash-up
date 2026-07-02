import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { paginationSchema, reconciliationListResponseSchema } from "./dto/reconciliation.dto"

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

  const whereClause = {
    matchStatus: { not: "MATCHED" as const },
  }

  const [transfers, total] = await Promise.all([
    prisma.inboundTransfer.findMany({
      where: whereClause,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        provider: true,
        nombaTransactionId: true,
        amountMinor: true,
        currency: true,
        senderName: true,
        senderBank: true,
        senderAccountNumber: true,
        narration: true,
        matchStatus: true,
        receivedAt: true,
      },
    }),
    prisma.inboundTransfer.count({ where: whereClause }),
  ])

  const response = {
    items: transfers.map((t) => {
      let maskedSenderAccount = t.senderAccountNumber
      if (maskedSenderAccount && maskedSenderAccount.length >= 4) {
        maskedSenderAccount = `••••${maskedSenderAccount.slice(-4)}`
      }

      return {
        ...t,
        senderAccountNumber: maskedSenderAccount,
      }
    }),
    total,
    page,
    limit,
  }

  return NextResponse.json(reconciliationListResponseSchema.parse(response))
}

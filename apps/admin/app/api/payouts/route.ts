import { NextResponse } from "next/server"
import { prisma, Prisma, PayoutStatus } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { paginationSchema, payoutListResponseSchema } from "./dto/payouts.dto"
import { z } from "zod"

const querySchema = paginationSchema.extend({
  // Upper-case then validate against the enum so a bad ?status= is a 400, not a
  // 500 at query time.
  status: z
    .preprocess((v) => (typeof v === "string" ? v.toUpperCase() : v), z.nativeEnum(PayoutStatus))
    .optional(),
})

export async function GET(req: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const url = new URL(req.url)
  const queryParams = Object.fromEntries(url.searchParams.entries())
  
  const parsed = querySchema.safeParse(queryParams)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
  }

  const { page, limit, status } = parsed.data

  const whereClause: Prisma.PayoutWhereInput = {}
  if (status) {
    whereClause.status = status
  }

  const [payouts, total] = await Promise.all([
    prisma.payout.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        cycleId: true,
        amountMinor: true,
        nombaTransferId: true,
        nombaStatus: true,
        recipientBankName: true,
        recipientAccountName: true,
        status: true,
        failureReason: true,
        createdAt: true,
      },
    }),
    prisma.payout.count({ where: whereClause }),
  ])

  const response = {
    items: payouts,
    total,
    page,
    limit,
  }

  return NextResponse.json(payoutListResponseSchema.parse(response))
}

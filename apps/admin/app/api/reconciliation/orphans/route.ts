import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { paginationSchema, orphanListResponseSchema } from "./dto/orphan.dto"

/**
 * PENDING orphans: credits spooled from Nomba's VA history that we have no
 * InboundTransfer for. Each maps to a member (the VA owner) so an admin can
 * replay it into their contribution/buffer or ignore it.
 */
export async function GET(req: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const url = new URL(req.url)
  const parsed = paginationSchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
  }
  const { page, limit } = parsed.data

  const where = { status: "PENDING" as const }

  const [orphans, total] = await Promise.all([
    prisma.orphanTransaction.findMany({
      where,
      orderBy: { transactionAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        nombaTransactionId: true,
        amountMinor: true,
        currency: true,
        entryType: true,
        txType: true,
        senderName: true,
        narration: true,
        transactionAt: true,
        spooledAt: true,
        virtualAccount: {
          select: {
            membership: {
              select: {
                id: true,
                user: { select: { name: true } },
                circle: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.orphanTransaction.count({ where }),
  ])

  const response = {
    items: orphans.map((o) => {
      // Orphans are only spooled for CIRCLE VAs, so membership is present in
      // practice; fall back defensively for the now-nullable relation.
      const m = o.virtualAccount.membership
      const { virtualAccount: _va, ...rest } = o
      return {
        ...rest,
        member: {
          membershipId: m?.id ?? "",
          name: m?.user.name ?? "Unknown",
          circleId: m?.circle.id ?? "",
          circleName: m?.circle.name ?? "Unknown",
        },
      }
    }),
    total,
    page,
    limit,
  }

  return NextResponse.json(orphanListResponseSchema.parse(response))
}

import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { paginationSchema, orphanListResponseSchema } from "./dto/orphan.dto"

/**
 * PENDING orphans: credits spooled from Nomba's sub-account feed that we have
 * no InboundTransfer or ChargeAttempt for (missed/failed webhooks). Covers both
 * VA transfers and card checkouts. VA-originated orphans may have null
 * virtualAccountId (global feed doesn't carry per-VA routing).
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
        sessionId: true,
        virtualAccount: {
          select: {
            kind: true,
            walletAccount: {
              select: {
                user: { select: { name: true } },
              },
            },
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
      // Orphans are only spooled for CIRCLE VAs (or global account), so membership is present in
      // practice; fall back defensively for the now-nullable relation.
      const m = o.virtualAccount?.membership
      const u = o.virtualAccount?.walletAccount?.user
      const { virtualAccount: _va, ...rest } = o
      
      const memberName = m?.user.name ?? u?.name ?? "Unknown"
      const circleName = m?.circle.name ?? (o.virtualAccount?.kind === "WALLET" ? "Global Wallet" : "Unknown")
      
      let sender = o.senderName
      if (!sender && o.txType === "online_checkout") {
        sender = "Card Checkout (Email available on resolve)"
      }

      return {
        ...rest,
        senderName: sender,
        member: {
          membershipId: m?.id ?? "",
          name: memberName,
          circleId: m?.circle.id ?? "",
          circleName: circleName,
        },
      }
    }),
    total,
    page,
    limit,
  }

  return NextResponse.json(orphanListResponseSchema.parse(response))
}

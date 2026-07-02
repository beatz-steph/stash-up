import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { circleDetailResponseSchema } from "../dto/circles.dto"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  const resolvedParams = await params

  const circle = await prisma.circle.findUnique({
    where: { id: resolvedParams.id },
    include: {
      memberships: {
        include: {
          user: { select: { name: true } },
          virtualAccount: true,
        },
        orderBy: { payoutPosition: "asc" },
      },
      cycles: {
        orderBy: { sequence: "asc" },
      },
    },
  })

  if (!circle) {
    return NextResponse.json({ error: "Circle not found" }, { status: 404 })
  }

  const members = circle.memberships.map((m) => {
    let maskedVA = null
    if (m.virtualAccount) {
      const actNum = m.virtualAccount.bankAccountNumber
      const last4 = actNum.length >= 4 ? actNum.slice(-4) : actNum
      maskedVA = {
        bankName: m.virtualAccount.bankName,
        accountName: m.virtualAccount.bankAccountName,
        accountNumber: `••••${last4}`,
      }
    }

    return {
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      role: m.role,
      status: m.status,
      payoutPosition: m.payoutPosition,
      vaStatus: m.virtualAccount ? m.virtualAccount.status : "NONE",
      virtualAccount: maskedVA,
    }
  })

  const response = {
    id: circle.id,
    name: circle.name,
    status: circle.status,
    frequency: circle.frequency,
    contributionMinor: circle.contributionMinor,
    totalSlots: circle.totalSlots,
    createdAt: circle.createdAt,
    creatorId: circle.createdByUserId,
    members,
    cycles: circle.cycles.map((c) => ({
      id: c.id,
      sequence: c.sequence,
      status: c.status,
      potCollectedMinor: c.potCollectedMinor,
      potExpectedMinor: c.potExpectedMinor,
    })),
  }

  return NextResponse.json(circleDetailResponseSchema.parse(response))
}

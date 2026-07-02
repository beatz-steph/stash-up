import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { userDetailResponseSchema } from "../dto/users.dto"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  const resolvedParams = await params

  const user = await prisma.user.findUnique({
    where: { id: resolvedParams.id },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      createdAt: true,
      lifetimeDefaultCount: true,
      blockedFromCircles: true,
      withdrawalAccount: {
        select: {
          bankName: true,
          accountName: true,
          accountNumber: true,
        },
      },
      memberships: {
        select: {
          id: true,
          role: true,
          status: true,
          joinedAt: true,
          circle: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Mask withdrawal account number
  let maskedWithdrawalAccount = null
  if (user.withdrawalAccount) {
    const actNum = user.withdrawalAccount.accountNumber
    const last4 = actNum.length >= 4 ? actNum.slice(-4) : actNum
    maskedWithdrawalAccount = {
      bankName: user.withdrawalAccount.bankName,
      accountName: user.withdrawalAccount.accountName,
      accountNumber: `••••${last4}`,
    }
  }

  const response = {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt,
    lifetimeDefaultCount: user.lifetimeDefaultCount,
    blockedFromCircles: user.blockedFromCircles,
    withdrawalAccount: maskedWithdrawalAccount,
    memberships: user.memberships.map((m) => ({
      id: m.id,
      circleId: m.circle.id,
      circleName: m.circle.name,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
    })),
  }

  return NextResponse.json(userDetailResponseSchema.parse(response))
}

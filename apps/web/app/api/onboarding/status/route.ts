import { getSession } from "@/lib/session"
import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import type { OnboardingStatus } from "../dto/status.dto"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const withdrawalAccount = await prisma.withdrawalAccount.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })

    const status: OnboardingStatus = {
      account: true,
      verified: !!session.user.emailVerified,
      withdrawal: !!withdrawalAccount,
    }
    return NextResponse.json(status)
  } catch (error) {
    console.error("Error fetching onboarding status:", error)
    return NextResponse.json({ error: "Failed to fetch onboarding status" }, { status: 500 })
  }
}

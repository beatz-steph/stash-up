import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"
import { prisma } from "@workspace/db"
import type { OnboardingStatus } from "../dto/status.dto"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return apiError("Unauthorized", 401)
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
    return apiSuccess<OnboardingStatus>(status)
  } catch (error) {
    console.error("Error fetching onboarding status:", error)
    return apiError("Failed to fetch onboarding status", 500)
  }
}

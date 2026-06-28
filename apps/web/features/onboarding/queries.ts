import { prisma } from "@workspace/db"

export interface OnboardingStatus {
  account: boolean
  withdrawal: boolean
  circle: boolean
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  if (!userId) {
    return { account: false, withdrawal: false, circle: false }
  }

  try {
    const [withdrawalAccount, membershipCount] = await Promise.all([
      prisma.withdrawalAccount.findUnique({
        where: { userId },
      }),
      prisma.membership.count({
        where: { userId },
      }),
    ])

    return {
      account: true, // session exists if we have a valid userId
      withdrawal: !!withdrawalAccount,
      circle: membershipCount > 0,
    }
  } catch (error) {
    console.error("Error fetching onboarding status:", error)
    return {
      account: true,
      withdrawal: false,
      circle: false,
    }
  }
}

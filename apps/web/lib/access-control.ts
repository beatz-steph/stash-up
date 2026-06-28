import { prisma } from "@workspace/db"

/**
 * Guard for money-movement actions (withdrawal account, circle create/join,
 * contributions, payouts). Sign-in is open to unverified users so they can look
 * around, but anything that touches money requires a verified email. Pass the
 * `session.user` returned by `auth.api.getSession`.
 */
export function requireVerifiedEmail(user: { emailVerified: boolean }) {
  if (!user.emailVerified) {
    throw new Error(
      "Please verify your email before setting up money movement. Check your inbox for the verification link.",
    )
  }
}

/**
 * Full onboarding gate for circle actions (create / join). A user may only touch a
 * circle once they've verified their email AND linked a withdrawal account. Call this
 * at the start of every circle create/join server action.
 */
export async function requireOnboardingComplete(user: { id: string; emailVerified: boolean }) {
  requireVerifiedEmail(user)
  const withdrawalAccount = await prisma.withdrawalAccount.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!withdrawalAccount) {
    throw new Error("Add a withdrawal account before creating or joining a circle.")
  }
}

export async function requireCircleMember(circleId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { circleId_userId: { circleId, userId } },
  })
  if (!membership) {
    throw new Error("Not a member of this circle")
  }
  return membership
}

export async function requireCircleCreator(circleId: string, userId: string) {
  const membership = await requireCircleMember(circleId, userId)
  if (membership.role !== "CREATOR") {
    throw new Error("Only the circle creator can perform this action")
  }
  return membership
}

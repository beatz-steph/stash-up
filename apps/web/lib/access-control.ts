import { prisma } from "@workspace/db"

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

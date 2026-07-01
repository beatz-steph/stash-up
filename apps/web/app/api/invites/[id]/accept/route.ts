import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"

import { prisma } from "@workspace/db";
import { requireOnboardingComplete } from "@/lib/access-control";
import { Prisma } from "@workspace/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  const invite = await prisma.circleInvite.findUnique({ where: { id } });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return apiError("Invite not found or expired", 404);
  }

  if (invite.invitedUserId !== session.user.id) {
    return apiError("You cannot accept this invite", 403);
  }

  try {
    await requireOnboardingComplete(session.user);
  } catch (err) {
    if (err instanceof Error) {
      return apiError(err.message, 403);
    }
    return apiError("Unknown error", 403);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { blockedFromCircles: true },
  });

  if (user?.blockedFromCircles) {
    return apiError("You are blocked from participating in circles", 403);
  }

  const circle = await prisma.circle.findUnique({ where: { id: invite.circleId } });
  if (!circle) return apiError("Circle not found", 404);

  if (circle.status !== "FORMING") {
    return apiError("Circle is no longer accepting members", 409);
  }

  const activeMembers = await prisma.membership.count({ where: { circleId: circle.id } });
  if (activeMembers >= circle.totalSlots) {
    return apiError("Circle is already full", 409);
  }

  try {
    const membership = await prisma.$transaction(async (tx) => {
      // Find lowest available payout position
      const members = await tx.membership.findMany({
        where: { circleId: circle.id },
        select: { payoutPosition: true },
        orderBy: { payoutPosition: "asc" },
      });

      const takenPositions = new Set(members.map((m) => m.payoutPosition));
      let assignPosition = 1;
      while (takenPositions.has(assignPosition)) {
        assignPosition++;
      }

      if (assignPosition > circle.totalSlots) {
        throw new Error("Circle full");
      }

      const newMembership = await tx.membership.create({
        data: {
          circleId: circle.id,
          userId: session.user.id,
          role: "MEMBER",
          payoutPosition: assignPosition,
          status: "ACTIVE",
        },
      });

      await tx.circleInvite.update({
        where: { id },
        data: { status: "ACCEPTED" },
      });

      return newMembership;
    });

    return apiSuccess({ membership });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return apiError("Another user joined at the exact same time. Please try again.", 409);
      }
    }
    if (error instanceof Error && error.message === "Circle full") {
      return apiError("Circle is already full", 409);
    }
    return apiError("Internal server error", 500);
  }
}

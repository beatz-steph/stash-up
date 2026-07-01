import { getSession } from "@/lib/session"
import { NextResponse } from "next/server";

import { prisma } from "@workspace/db";
import { requireOnboardingComplete } from "@/lib/access-control";
import { Prisma } from "@workspace/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const invite = await prisma.circleInvite.findUnique({ where: { id } });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 });
  }

  if (invite.invitedUserId !== session.user.id) {
    return NextResponse.json({ error: "You cannot accept this invite" }, { status: 403 });
  }

  try {
    await requireOnboardingComplete(session.user);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { blockedFromCircles: true },
  });

  if (user?.blockedFromCircles) {
    return NextResponse.json(
      { error: "You are blocked from participating in circles" },
      { status: 403 }
    );
  }

  const circle = await prisma.circle.findUnique({ where: { id: invite.circleId } });
  if (!circle) return NextResponse.json({ error: "Circle not found" }, { status: 404 });

  if (circle.status !== "FORMING") {
    return NextResponse.json({ error: "Circle is no longer accepting members" }, { status: 409 });
  }

  const activeMembers = await prisma.membership.count({ where: { circleId: circle.id } });
  if (activeMembers >= circle.totalSlots) {
    return NextResponse.json({ error: "Circle is already full" }, { status: 409 });
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

    return NextResponse.json({ success: true, membership });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Another user joined at the exact same time. Please try again." },
          { status: 409 }
        );
      }
    }
    if (error instanceof Error && error.message === "Circle full") {
      return NextResponse.json({ error: "Circle is already full" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

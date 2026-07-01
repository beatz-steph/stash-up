import { getSession } from "@/lib/session"
import { NextResponse } from "next/server";
import { prisma } from "@workspace/db";
import { requireOnboardingComplete } from "@/lib/access-control";
import { validateRequestBody } from "@/lib/api/validate";
import { CreateCircleReqSchema } from "./dto/circles.dto";

export async function POST(req: Request) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validation = await validateRequestBody(req, CreateCircleReqSchema);
  if (!validation.success) return validation.errorResponse;
  const { data } = validation;

  // Onboarding gate
  try {
    await requireOnboardingComplete(session.user);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 403 });
  }

  // Check if blocked
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

  // Create Circle and Membership
  const circle = await prisma.$transaction(async (tx) => {
    return await tx.circle.create({
      data: {
        name: data.name,
        contributionMinor: data.contributionMinor,
        frequency: data.frequency,
        totalSlots: data.totalSlots,
        startDeadline: data.startDeadline,
        status: "FORMING",
        createdByUserId: session.user.id,
        memberships: {
          create: {
            userId: session.user.id,
            role: "CREATOR",
            payoutPosition: 1,
            status: "ACTIVE",
          },
        },
      },
    });
  });

  return NextResponse.json(circle, { status: 201 });
}

export async function GET(req: Request) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const circles = await prisma.circle.findMany({
    where: {
      memberships: {
        some: {
          userId: session.user.id,
        },
      },
    },
    include: {
      memberships: {
        where: { userId: session.user.id },
      },
      _count: {
        select: { memberships: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const response = circles.map((circle) => ({
    id: circle.id,
    name: circle.name,
    contributionMinor: circle.contributionMinor,
    currency: circle.currency,
    frequency: circle.frequency,
    status: circle.status,
    totalSlots: circle.totalSlots,
    createdAt: circle.createdAt,
    myRole: circle.memberships[0]?.role,
    myStatus: circle.memberships[0]?.status,
    filledSlots: circle._count.memberships,
  }));

  return NextResponse.json(response);
}

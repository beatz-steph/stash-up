import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@workspace/db";
import { requireCircleMember } from "@/lib/access-control";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await requireCircleMember(id, session.user.id);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 403 });
  }

  const circle = await prisma.circle.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              image: true,
            },
          },
        },
        orderBy: { payoutPosition: "asc" },
      },
      invites: {
        where: { status: "PENDING" },
        include: {
          invitedUser: {
            select: {
              id: true,
              name: true,
              username: true,
              image: true,
            },
          },
        },
      },
    },
  });

  if (!circle) {
    return NextResponse.json({ error: "Circle not found" }, { status: 404 });
  }

  const response = {
    id: circle.id,
    name: circle.name,
    contributionMinor: circle.contributionMinor,
    currency: circle.currency,
    frequency: circle.frequency,
    status: circle.status,
    totalSlots: circle.totalSlots,
    startDeadline: circle.startDeadline,
    createdAt: circle.createdAt,
    members: circle.memberships.map((m) => ({
      user: m.user,
      role: m.role,
      payoutPosition: m.payoutPosition,
      status: m.status,
    })),
    invites: circle.invites.map((i) => ({
      id: i.id,
      invitedUser: i.invitedUser,
      status: i.status,
      expiresAt: i.expiresAt,
    })),
  };

  return NextResponse.json(response);
}

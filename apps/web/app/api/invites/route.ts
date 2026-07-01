import { getSession } from "@/lib/session"
import { NextResponse } from "next/server";

import { prisma } from "@workspace/db";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invites = await prisma.circleInvite.findMany({
    where: {
      invitedUserId: session.user.id,
      status: "PENDING",
      expiresAt: { gt: new Date() }, // Only active unexpired
    },
    include: {
      circle: {
        select: {
          id: true,
          name: true,
          contributionMinor: true,
          frequency: true,
        },
      },
      invitedBy: {
        select: {
          name: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const response = invites.map((inv) => ({
    id: inv.id,
    status: inv.status,
    expiresAt: inv.expiresAt,
    circle: inv.circle,
    invitedBy: inv.invitedBy,
  }));

  return NextResponse.json(response);
}

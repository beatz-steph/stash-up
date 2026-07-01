import { getSession } from "@/lib/session"
import { NextResponse } from "next/server";

import { prisma } from "@workspace/db";
import { requireCircleCreator, requireFormingCircle } from "@/lib/access-control";
import { validateRequestBody } from "@/lib/api/validate";
import { InviteReqSchema } from "../../dto/circles.dto";
import { createNotification } from "@/lib/notifications";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const validation = await validateRequestBody(req, InviteReqSchema);
  if (!validation.success) return validation.errorResponse;
  const { data } = validation;

  let circle;
  try {
    await requireCircleCreator(id, session.user.id);
    circle = await requireFormingCircle(id);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 403 });
  }

  const userToInvite = await prisma.user.findUnique({
    where: { username: data.username.toLowerCase() },
  });

  if (!userToInvite) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (userToInvite.id === session.user.id) {
    return NextResponse.json({ error: "You cannot invite yourself" }, { status: 403 });
  }

  if (userToInvite.blockedFromCircles) {
    return NextResponse.json({ error: "This user is blocked from participating in circles" }, { status: 403 });
  }

  // Check if they are already an active member
  const existingMembership = await prisma.membership.findUnique({
    where: { circleId_userId: { circleId: id, userId: userToInvite.id } },
  });

  if (existingMembership) {
    return NextResponse.json({ error: "User is already a member of this circle" }, { status: 409 });
  }

  // Capacity check
  const activeMembers = await prisma.membership.count({ where: { circleId: id } });
  const pendingInvites = await prisma.circleInvite.count({ where: { circleId: id, status: "PENDING" } });

  if (activeMembers + pendingInvites >= circle.totalSlots) {
    return NextResponse.json({ error: "Circle has no open slots left" }, { status: 409 });
  }

  // Upsert semantics
  const existingInvite = await prisma.circleInvite.findUnique({
    where: { circleId_invitedUserId: { circleId: id, invitedUserId: userToInvite.id } },
  });

  if (existingInvite?.status === "PENDING") {
    return NextResponse.json({ error: "An active invite already exists for this user" }, { status: 409 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.circleInvite.upsert({
    where: { circleId_invitedUserId: { circleId: id, invitedUserId: userToInvite.id } },
    update: { status: "PENDING", expiresAt },
    create: {
      circleId: id,
      invitedUserId: userToInvite.id,
      invitedByUserId: session.user.id,
      expiresAt,
    },
  });

  await createNotification({
    userId: userToInvite.id,
    type: "CIRCLE_INVITE",
    title: "New Circle Invite",
    body: `You have been invited to join ${circle.name}`,
    link: `/circles/invites`,
  });

  return NextResponse.json(invite, { status: 201 });
}

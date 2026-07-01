import { getSession } from "@/lib/session"
import { NextResponse } from "next/server";

import { prisma } from "@workspace/db";

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
    return NextResponse.json({ error: "You cannot decline this invite" }, { status: 403 });
  }

  await prisma.circleInvite.update({
    where: { id },
    data: { status: "DECLINED" },
  });

  return NextResponse.json({ success: true });
}

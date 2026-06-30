import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@workspace/db";
import { requireCircleCreator } from "@/lib/access-control";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, inviteId } = await params;

  try {
    await requireCircleCreator(id, session.user.id);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 403 });
  }

  await prisma.circleInvite.update({
    where: { id: inviteId },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ success: true });
}

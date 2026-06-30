import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@workspace/db";
import { requireCircleMember, requireFormingCircle } from "@/lib/access-control";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let membership;
  try {
    membership = await requireCircleMember(id, session.user.id);
    await requireFormingCircle(id);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 403 });
  }

  if (membership.role === "CREATOR") {
    return NextResponse.json(
      { error: "Creator cannot leave the circle. Cancel the circle instead." },
      { status: 403 }
    );
  }

  await prisma.membership.delete({
    where: {
      circleId_userId: { circleId: id, userId: session.user.id },
    },
  });

  return NextResponse.json({ success: true });
}

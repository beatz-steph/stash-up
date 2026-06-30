import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@workspace/db";
import { requireCircleCreator, requireFormingCircle } from "@/lib/access-control";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await requireCircleCreator(id, session.user.id);
    await requireFormingCircle(id);
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.circle.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await tx.circleInvite.updateMany({
      where: { circleId: id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  });

  return NextResponse.json({ success: true });
}

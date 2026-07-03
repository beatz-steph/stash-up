import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"

import { prisma, Prisma } from "@workspace/db";
import { requireCircleCreator, requireFormingCircle } from "@/lib/access-control";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  try {
    await requireCircleCreator(id, session.user.id);
    await requireFormingCircle(id);
  } catch (err) {
    if (err instanceof Error) {
      return apiError(err.message, 403);
    }
    return apiError("Unknown error", 403);
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.circle.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await tx.circleInvite.updateMany({
      where: { circleId: id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  });

  return apiSuccess({ success: true });
}

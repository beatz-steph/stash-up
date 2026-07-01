import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"

import { prisma } from "@workspace/db";
import { requireCircleMember, requireFormingCircle } from "@/lib/access-control";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  let membership;
  try {
    membership = await requireCircleMember(id, session.user.id);
    await requireFormingCircle(id);
  } catch (err) {
    if (err instanceof Error) {
      return apiError(err.message, 403);
    }
    return apiError("Unknown error", 403);
  }

  if (membership.role === "CREATOR") {
    return apiError("Creator cannot leave the circle. Cancel the circle instead.", 403);
  }

  await prisma.membership.delete({
    where: {
      circleId_userId: { circleId: id, userId: session.user.id },
    },
  });

  return apiSuccess({ success: true });
}

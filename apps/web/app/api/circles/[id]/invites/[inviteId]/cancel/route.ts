import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"

import { prisma } from "@workspace/db";
import { requireCircleCreator } from "@/lib/access-control";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id, inviteId } = await params;

  try {
    await requireCircleCreator(id, session.user.id);
  } catch (err) {
    if (err instanceof Error) {
      return apiError(err.message, 403);
    }
    return apiError("Unknown error", 403);
  }

  await prisma.circleInvite.update({
    where: { id: inviteId },
    data: { status: "CANCELLED" },
  });

  return apiSuccess({ success: true });
}

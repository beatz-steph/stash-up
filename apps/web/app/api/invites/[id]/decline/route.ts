import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"

import { prisma } from "@workspace/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  const invite = await prisma.circleInvite.findUnique({ where: { id } });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return apiError("Invite not found or expired", 404);
  }

  if (invite.invitedUserId !== session.user.id) {
    return apiError("You cannot decline this invite", 403);
  }

  await prisma.circleInvite.update({
    where: { id },
    data: { status: "DECLINED" },
  });

  return apiSuccess({ success: true });
}

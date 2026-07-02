import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { requireCircleMember } from "@/lib/access-control";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  try {
    await requireCircleMember(id, session.user.id);
  } catch (err) {
    if (err instanceof Error) {
      return apiError(err.message, 403);
    }
    return apiError("Unknown error", 403);
  }

  const membership = await prisma.membership.findUnique({
    where: { circleId_userId: { circleId: id, userId: session.user.id } },
    include: { virtualAccount: true },
  });

  if (!membership) {
    return apiError("Membership not found", 404);
  }

  if (!membership.virtualAccount) {
    return apiSuccess({ virtualAccount: null });
  }

  return apiSuccess({
    virtualAccount: {
      bankAccountNumber: membership.virtualAccount.bankAccountNumber,
      bankAccountName: membership.virtualAccount.bankAccountName,
      bankName: membership.virtualAccount.bankName,
    },
  });
}

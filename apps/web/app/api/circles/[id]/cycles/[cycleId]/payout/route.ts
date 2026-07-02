import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { requireCircleCreator } from "@/lib/access-control";
import { initiatePayout } from "@/lib/payout/initiate";
import { prisma } from "@workspace/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; cycleId: string }> }
) {
  const { id, cycleId } = await params;
  
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const session = await getSession();
    if (!session?.user) {
      return apiError("Unauthorized", 401);
    }
    
    try {
      await requireCircleCreator(id, session.user.id);
    } catch (err) {
      return apiError(err instanceof Error ? err.message : "Forbidden", 403);
    }
  }

  // Verify cycleId belongs to id
  const cycle = await prisma.cycle.findUnique({
    where: { id: cycleId },
    select: { circleId: true },
  });

  if (!cycle || cycle.circleId !== id) {
    return apiError("Cycle not found or does not belong to circle", 404);
  }

  try {
    await initiatePayout(cycleId);
    return apiSuccess({ initiated: true });
  } catch (err) {
    console.error(`Manual payout initiation failed for ${cycleId}:`, err);
    return apiError(err instanceof Error ? err.message : "Payout initiation failed", 502);
  }
}

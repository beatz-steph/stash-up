import { prisma } from "@workspace/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { initiatePayout } from "@/lib/payout/initiate";

export async function GET(request: Request) {
  // 1. Check CRON_SECRET auth
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return apiError("Unauthorized", 401);
  }

  // 2. Query for cycles ready for payout
  const readyCycles = await prisma.cycle.findMany({
    where: {
      status: "READY_TO_PAYOUT",
    },
  });

  if (readyCycles.length === 0) {
    return apiSuccess({ swept: 0 }, 200);
  }

  let sweptCount = 0;

  // 3. Process each cycle in its own execution context
  for (const cycle of readyCycles) {
    try {
      await initiatePayout(cycle.id);
      sweptCount++;
    } catch (err) {
      console.error(`Failed to initiate payout for cycle ${cycle.id}:`, err);
    }
  }

  return apiSuccess({ swept: sweptCount }, 200);
}

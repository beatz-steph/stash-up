import { prisma } from "@workspace/db";
import { apiSuccess, apiError } from "@/lib/api/response";

export async function GET(request: Request) {
  // 1. Check CRON_SECRET auth
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return apiError("Unauthorized", 401);
  }

  // 2. Query for overdue cycles
  const overdueCycles = await prisma.cycle.findMany({
    where: {
      status: { in: ["OPEN", "COLLECTING"] },
      deadline: { lt: new Date() },
    },
    include: {
      circle: {
        include: {
          memberships: {
            where: { status: "ACTIVE" }, // Only active members are expected to contribute
          },
        },
      },
      contributions: true,
    },
  });

  if (overdueCycles.length === 0) {
    return apiSuccess({ swept: 0 }, 200);
  }

  let sweptCount = 0;

  // 3. Process each cycle in its own transaction so a failure in one doesn't roll back all
  for (const cycle of overdueCycles) {
    try {
      await prisma.$transaction(async (tx) => {
        // Re-check cycle status inside tx
        const currentCycle = await tx.cycle.findUnique({
          where: { id: cycle.id },
          include: { contributions: true },
        });

        if (
          !currentCycle ||
          (currentCycle.status !== "OPEN" && currentCycle.status !== "COLLECTING")
        ) {
          return;
        }

        // Determine which members defaulted
        const defaultedMemberIds: string[] = [];

        for (const membership of cycle.circle.memberships) {
          const existing = currentCycle.contributions.find(
            (c) => c.membershipId === membership.id
          );

          if (!existing || existing.status === "PENDING" || existing.status === "PARTIAL") {
            defaultedMemberIds.push(membership.id);

            // Mark contribution as DEFAULTED
            await tx.contribution.upsert({
              where: {
                cycleId_membershipId: {
                  cycleId: cycle.id,
                  membershipId: membership.id,
                },
              },
              update: { status: "DEFAULTED" },
              create: {
                cycleId: cycle.id,
                membershipId: membership.id,
                amountMinor: existing?.amountMinor || 0,
                status: "DEFAULTED",
              },
            });
          }
        }

        // Increment default counts for these members
        if (defaultedMemberIds.length > 0) {
          await tx.membership.updateMany({
            where: { id: { in: defaultedMemberIds } },
            data: { defaultCount: { increment: 1 } },
          });
        }

        // Flip cycle to AWAITING_RESOLUTION
        await tx.cycle.update({
          where: { id: cycle.id },
          data: { status: "AWAITING_RESOLUTION" },
        });
      });
      sweptCount++;
    } catch (err) {
      console.error(`Failed to sweep cycle ${cycle.id}:`, err);
    }
  }

  return apiSuccess({ swept: sweptCount }, 200);
}

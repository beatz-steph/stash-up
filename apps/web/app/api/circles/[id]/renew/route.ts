import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma, Prisma } from "@workspace/db";
import { requireCircleCreator } from "@/lib/access-control";
import { calculateDeadline } from "@/lib/circles/activation";
import { applyBuffersToNewCycle } from "@/lib/payout/rotation";

/**
 * Renew a COMPLETED circle: start another full rotation with the same
 * members, amounts, and virtual accounts (renew = reset in place, not a
 * cloned circle — VAs are keyed to membershipId, so reusing memberships
 * means zero re-provisioning). Creator-only.
 *
 * Guards:
 * - circle must be COMPLETED (v1: no renewing an ACTIVE/FORMING/CANCELLED circle)
 * - every membership must still be ACTIVE (a member who left/was suspended
 *   mid-rotation blocks renewal for v1 — no reshuffle/backfill)
 *
 * Same payout order every round (decided 2026-07-03) — recipient of the
 * fresh round is always payoutPosition 1.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  try {
    await requireCircleCreator(id, session.user.id);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Unknown error", 403);
  }

  const circle = await prisma.circle.findUnique({
    where: { id },
    include: { memberships: true },
  });

  if (!circle) {
    return apiError("Circle not found", 404);
  }

  if (circle.status !== "COMPLETED") {
    return apiError("Only a completed circle can be renewed", 400);
  }

  const inactiveMember = circle.memberships.find((m) => m.status !== "ACTIVE");
  if (inactiveMember) {
    return apiError(
      "All members must be active to renew this circle — a member has left or been suspended.",
      400
    );
  }

  const recipient = circle.memberships.find((m) => m.payoutPosition === 1);
  if (!recipient) {
    return apiError(`No member found for payoutPosition 1 in circle ${id}`, 400);
  }

  const nextSequence = circle.currentCycleSeq + 1;
  const potExpectedMinor = circle.memberships.length * circle.contributionMinor; // all ACTIVE, checked above
  const deadline = calculateDeadline(circle.frequency);

  const newCycle = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.cycle.create({
      data: {
        circleId: circle.id,
        sequence: nextSequence,
        recipientMembershipId: recipient.id,
        potExpectedMinor,
        deadline,
        status: "OPEN",
      },
    });

    await tx.circle.update({
      where: { id: circle.id },
      data: {
        status: "ACTIVE",
        currentCycleSeq: nextSequence,
        renewalCount: { increment: 1 },
      },
    });

    await applyBuffersToNewCycle(tx, circle, created);

    return created;
  });

  return apiSuccess({ cycleId: newCycle.id, sequence: newCycle.sequence });
}

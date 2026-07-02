import { Prisma } from "@workspace/db";
import { calculateDeadline } from "@/lib/circles/activation";

export async function advanceRotation(
  tx: Prisma.TransactionClient,
  circleId: string,
  currentCycle: { sequence: number }
): Promise<void> {
  const circle = await tx.circle.findUnique({
    where: { id: circleId },
    include: { memberships: true },
  });

  if (!circle) throw new Error(`Circle not found: ${circleId}`);

  // Last-cycle condition: if current cycle is the final one, mark circle completed
  if (currentCycle.sequence >= circle.totalSlots) {
    await tx.circle.update({
      where: { id: circleId },
      data: { status: "COMPLETED" },
    });
    return;
  }

  const nextSequence = currentCycle.sequence + 1;
  
  // Next recipient: find by position. For MVP, we assign by position even if they are
  // SUSPENDED or DEFAULTED (documenting this behavior as requested).
  const recipient = circle.memberships.find(m => m.payoutPosition === nextSequence);
  if (!recipient) {
    throw new Error(`No member found for payoutPosition ${nextSequence} in circle ${circleId}`);
  }

  // Next potExpectedMinor: recompute from currently ACTIVE members × circle.contributionMinor
  const activeMembersCount = circle.memberships.filter(m => m.status === "ACTIVE").length;
  const potExpectedMinor = activeMembersCount * circle.contributionMinor;

  // Next deadline
  const nextDeadline = calculateDeadline(circle.frequency);

  // Pre-check existence to avoid P2002 aborting the Postgres transaction
  const existingCycle = await tx.cycle.findUnique({
    where: { circleId_sequence: { circleId: circle.id, sequence: nextSequence } },
  });

  if (existingCycle) {
    // Already advanced by a concurrent process
    return;
  }

  // NOTE: the create below is intentionally NOT wrapped in a try/catch-P2002.
  // This runs inside the caller's interactive $transaction (see dispatch.ts
  // payout_success), which also marks the Payout SUCCESS and the Cycle PAID_OUT.
  // A P2002 here means a truly concurrent redelivery raced past the upstream
  // `payout.status === "SUCCESS"` guard. Letting it propagate rolls the whole
  // transaction back and returns non-200, so Nomba retries and the pre-check
  // above then short-circuits cleanly. Catching-and-returning instead would let
  // Prisma COMMIT an already-aborted Postgres transaction (a silent rollback of
  // the SUCCESS/PAID_OUT writes with no error surfaced) — do NOT add one.
  await tx.cycle.create({
    data: {
      circleId: circle.id,
      sequence: nextSequence,
      recipientMembershipId: recipient.id,
      potExpectedMinor,
      deadline: nextDeadline,
      status: "OPEN",
    },
  });

  // Increment currentCycleSeq
  await tx.circle.update({
    where: { id: circleId },
    data: { currentCycleSeq: nextSequence },
  });
}

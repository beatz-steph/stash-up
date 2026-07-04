import { Prisma } from "@workspace/db";
import { calculateDeadline } from "@/lib/circles/activation";

type CircleWithMemberships = Prisma.CircleGetPayload<{ include: { memberships: true } }>;
type CycleRecord = { id: string };

/**
 * Auto-apply carried-over credit: each ACTIVE member's surplus (bufferMinor)
 * from previous cycles is applied toward the new cycle's contribution,
 * reducing what they still owe. A member whose buffer covers a full
 * contribution is marked COMPLETE without transferring anything.
 *
 * Shared by advanceRotation (normal rotation advance) and the circle renew
 * endpoint (starting a fresh round) — same semantics either way: whatever
 * credit a member is carrying gets applied the moment a new cycle opens.
 * Caller is responsible for only invoking this once per cycle (both call
 * sites create the cycle immediately before calling this, inside the same
 * transaction).
 */
export async function applyBuffersToNewCycle(
  tx: Prisma.TransactionClient,
  circle: CircleWithMemberships,
  newCycle: CycleRecord
): Promise<void> {
  const contributionMinor = circle.contributionMinor;
  let potFromBuffers = 0;

  for (const m of circle.memberships) {
    if (m.status !== "ACTIVE") continue;
    const buffer = m.bufferMinor ?? 0;
    const applied = Math.min(buffer, contributionMinor);
    if (applied <= 0) continue;

    await tx.contribution.create({
      data: {
        cycleId: newCycle.id,
        membershipId: m.id,
        amountMinor: applied,
        status: applied >= contributionMinor ? "COMPLETE" : "PARTIAL",
      },
    });

    await tx.membership.update({
      where: { id: m.id },
      data: { bufferMinor: { decrement: applied } },
    });

    potFromBuffers += applied;
  }

  if (potFromBuffers > 0) {
    // The cycle was just created with potCollectedMinor 0, so these are absolute.
    const potExpectedMinor = circle.memberships.filter((m) => m.status === "ACTIVE").length * contributionMinor;
    const status = potFromBuffers >= potExpectedMinor ? "READY_TO_PAYOUT" : "COLLECTING";
    await tx.cycle.update({
      where: { id: newCycle.id },
      data: { potCollectedMinor: potFromBuffers, status },
    });
  }
}

/**
 * Advance a circle's rotation after a cycle's payout completes.
 *
 * Renewal-aware position math: `totalSlots` (N) members receive one payout
 * per round, in payoutPosition order. `currentCycle.sequence` (S) keeps
 * growing across renewals (round 2 continues at S+1, not back to 1), so the
 * position within the CURRENT round is `((S - 1) % N) + 1`, and the position
 * that receives the NEXT cycle is `(S % N) + 1`. A round completes exactly
 * when S is a multiple of N (the last position of the round was just paid) —
 * at that point this function marks the circle COMPLETED instead of
 * advancing; renewal (a separate creator-initiated action, see
 * app/api/circles/[id]/renew/route.ts) is what starts the next round.
 */
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

  // End-of-round condition: the cycle that was just paid out was the last
  // position in its round (S % totalSlots === 0) → mark circle completed.
  // The creator renews explicitly to start another round (see the renew
  // endpoint) rather than this function auto-advancing into it.
  if (currentCycle.sequence % circle.totalSlots === 0) {
    await tx.circle.update({
      where: { id: circleId },
      data: { status: "COMPLETED" },
    });
    return;
  }

  const nextSequence = currentCycle.sequence + 1;
  const nextPos = (currentCycle.sequence % circle.totalSlots) + 1;

  // Next recipient: find by position. For MVP, we assign by position even if they are
  // SUSPENDED or DEFAULTED (documenting this behavior as requested).
  const recipient = circle.memberships.find(m => m.payoutPosition === nextPos);
  if (!recipient) {
    throw new Error(`No member found for payoutPosition ${nextPos} in circle ${circleId}`);
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
  const newCycle = await tx.cycle.create({
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

  await applyBuffersToNewCycle(tx, circle, newCycle);
}

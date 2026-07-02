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

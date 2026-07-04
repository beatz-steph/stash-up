import type { Prisma } from "@workspace/db";
import type { MatchResult } from "./match";

/**
 * Apply a matcher result to a member's cycle: upsert the contribution, credit
 * any overflow to their buffer, increment the pot, and flip the cycle status
 * (OPEN→COLLECTING on first money, →READY_TO_PAYOUT once fully collected).
 *
 * This is the single implementation shared by the VA-transfer webhook path and
 * the card-settlement path (enrollment/charge). It assumes an eligible result
 * (matchedCycleId + matchedMembershipId present); UNMATCHED/UNKNOWN_VA results
 * must be handled by the caller before calling this. Idempotency (don't apply
 * the same webhook twice) is the caller's responsibility — it guards on the
 * InboundTransfer unique key / ChargeAttempt status before invoking this.
 */
export async function applyContributionSplit(
  tx: Prisma.TransactionClient,
  result: MatchResult
): Promise<{ appliedToPot: number; appliedToBuffer: number }> {
  if (!result.matchedCycleId || !result.matchedMembershipId) {
    return { appliedToPot: 0, appliedToBuffer: 0 };
  }

  await tx.contribution.upsert({
    where: {
      cycleId_membershipId: {
        cycleId: result.matchedCycleId,
        membershipId: result.matchedMembershipId,
      },
    },
    update: {
      amountMinor: result.newContributionAmount,
      status: result.contributionStatus!,
    },
    create: {
      cycleId: result.matchedCycleId,
      membershipId: result.matchedMembershipId,
      amountMinor: result.newContributionAmount,
      status: result.contributionStatus!,
    },
  });

  let appliedToBuffer = 0;
  if (result.amountToBuffer > 0) {
    await tx.membership.update({
      where: { id: result.matchedMembershipId },
      data: { bufferMinor: { increment: result.amountToBuffer } },
    });
    appliedToBuffer = result.amountToBuffer;
  }

  let appliedToPot = 0;
  if (result.amountAppliedToPot > 0) {
    const updatedCycle = await tx.cycle.update({
      where: { id: result.matchedCycleId },
      data: { potCollectedMinor: { increment: result.amountAppliedToPot } },
    });
    appliedToPot = result.amountAppliedToPot;

    if (
      updatedCycle.potCollectedMinor >= updatedCycle.potExpectedMinor &&
      (updatedCycle.status === "OPEN" || updatedCycle.status === "COLLECTING")
    ) {
      await tx.cycle.update({
        where: { id: updatedCycle.id },
        data: { status: "READY_TO_PAYOUT" },
      });
    } else if (updatedCycle.status === "OPEN" && updatedCycle.potCollectedMinor > 0) {
      await tx.cycle.update({
        where: { id: updatedCycle.id },
        data: { status: "COLLECTING" },
      });
    }
  }

  return { appliedToPot, appliedToBuffer };
}

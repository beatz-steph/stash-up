import type { MatchStatus, ContributionStatus, CircleStatus, CycleStatus } from "@prisma/client";

// Minimal subset of DB models needed for the pure function
export interface MatchContext {
  virtualAccount: {
    id: string;
    accountRef: string;
    membershipId: string;
  } | null;
  membership: {
    id: string;
    circleId: string;
  } | null;
  circle: {
    id: string;
    status: CircleStatus;
    contributionMinor: number;
    currentCycleSeq: number;
  } | null;
  cycle: {
    id: string;
    sequence: number;
    status: CycleStatus;
  } | null;
  existingContribution: {
    id: string;
    amountMinor: number;
    status: ContributionStatus;
  } | null;
}

export type MatchDecision = MatchStatus | "UNKNOWN_VA";

export interface MatchResult {
  decision: MatchDecision;
  matchedCycleId: string | null;
  matchedMembershipId: string | null;
  amountAppliedToPot: number;
  amountToBuffer: number;
  contributionStatus: ContributionStatus | null;
  newContributionAmount: number;
}

export function matchInboundTransfer(
  inboundAmountMinor: number,
  aliasAccountReference: string,
  ctx: MatchContext
): MatchResult {
  // 1. Unknown VA
  if (!ctx.virtualAccount) {
    return {
      decision: "UNKNOWN_VA",
      matchedCycleId: null,
      matchedMembershipId: null,
      amountAppliedToPot: 0,
      amountToBuffer: 0,
      contributionStatus: null,
      newContributionAmount: 0,
    };
  }

  // 2. Known VA, but no eligible cycle/circle
  const isCircleActive = ctx.circle && ctx.circle.status === "ACTIVE";
  const isOpenCycle = ctx.cycle && (ctx.cycle.status === "OPEN" || ctx.cycle.status === "COLLECTING");
  
  if (!ctx.membership || !isCircleActive || !isOpenCycle) {
    return {
      decision: "UNMATCHED",
      matchedCycleId: null,
      matchedMembershipId: ctx.membership?.id || null, // Best effort linkage
      amountAppliedToPot: 0,
      amountToBuffer: 0,
      contributionStatus: null,
      newContributionAmount: 0,
    };
  }

  // 3. We have an eligible cycle. Calculate remaining.
  const requiredMinor = ctx.circle!.contributionMinor;
  const existingMinor = ctx.existingContribution?.amountMinor || 0;
  
  // What is still owed in this cycle by this member?
  const remainingMinor = Math.max(0, requiredMinor - existingMinor);

  let decision: MatchDecision;
  let amountAppliedToPot = 0;
  let amountToBuffer = 0;

  if (inboundAmountMinor === remainingMinor) {
    decision = "MATCHED";
    amountAppliedToPot = inboundAmountMinor;
    amountToBuffer = 0;
  } else if (inboundAmountMinor < remainingMinor) {
    decision = "UNDERPAID";
    amountAppliedToPot = inboundAmountMinor;
    amountToBuffer = 0;
  } else {
    // OVERPAID
    decision = "OVERPAID";
    amountAppliedToPot = remainingMinor;
    amountToBuffer = inboundAmountMinor - remainingMinor;
  }

  const newContributionAmount = existingMinor + amountAppliedToPot;
  const contributionStatus = newContributionAmount >= requiredMinor ? "COMPLETE" : "PARTIAL";

  return {
    decision,
    matchedCycleId: ctx.cycle!.id,
    matchedMembershipId: ctx.membership!.id,
    amountAppliedToPot,
    amountToBuffer,
    contributionStatus,
    newContributionAmount,
  };
}

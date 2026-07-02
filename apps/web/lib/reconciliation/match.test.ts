import { describe, it, expect } from "vitest";
import { matchInboundTransfer, MatchContext } from "./match";

describe("matchInboundTransfer", () => {
  const baseCtx: MatchContext = {
    virtualAccount: { id: "va-1", accountRef: "ref-1", membershipId: "m-1" },
    membership: { id: "m-1", circleId: "c-1" },
    circle: { id: "c-1", status: "ACTIVE", contributionMinor: 5000, currentCycleSeq: 1 },
    cycle: { id: "cy-1", sequence: 1, status: "OPEN" },
    existingContribution: null,
  };

  it("returns UNKNOWN_VA when no virtual account matches", () => {
    const result = matchInboundTransfer(5000, "unknown-ref", {
      ...baseCtx,
      virtualAccount: null,
    });
    expect(result.decision).toBe("UNKNOWN_VA");
  });

  it("returns UNMATCHED when member has no open cycle", () => {
    const result = matchInboundTransfer(5000, "ref-1", {
      ...baseCtx,
      cycle: { ...baseCtx.cycle!, status: "READY_TO_PAYOUT" },
    });
    expect(result.decision).toBe("UNMATCHED");
  });

  it("returns MATCHED for exact payment", () => {
    const result = matchInboundTransfer(5000, "ref-1", baseCtx);
    expect(result.decision).toBe("MATCHED");
    expect(result.amountAppliedToPot).toBe(5000);
    expect(result.amountToBuffer).toBe(0);
    expect(result.contributionStatus).toBe("COMPLETE");
    expect(result.newContributionAmount).toBe(5000);
  });

  it("returns UNDERPAID for partial payment", () => {
    const result = matchInboundTransfer(3000, "ref-1", baseCtx);
    expect(result.decision).toBe("UNDERPAID");
    expect(result.amountAppliedToPot).toBe(3000);
    expect(result.amountToBuffer).toBe(0);
    expect(result.contributionStatus).toBe("PARTIAL");
    expect(result.newContributionAmount).toBe(3000);
  });

  it("returns OVERPAID for excess payment", () => {
    const result = matchInboundTransfer(7000, "ref-1", baseCtx);
    expect(result.decision).toBe("OVERPAID");
    expect(result.amountAppliedToPot).toBe(5000); // capped at 5000
    expect(result.amountToBuffer).toBe(2000);
    expect(result.contributionStatus).toBe("COMPLETE");
    expect(result.newContributionAmount).toBe(5000);
  });

  it("calculates remaining for second payment accurately", () => {
    // Member owes 5000, already paid 3000
    const ctx: MatchContext = {
      ...baseCtx,
      existingContribution: {
        id: "contrib-1",
        amountMinor: 3000,
        status: "PARTIAL",
      },
    };

    // Now pays 2000 exactly
    let result = matchInboundTransfer(2000, "ref-1", ctx);
    expect(result.decision).toBe("MATCHED");
    expect(result.amountAppliedToPot).toBe(2000);
    expect(result.contributionStatus).toBe("COMPLETE");

    // Overpays remaining
    result = matchInboundTransfer(3000, "ref-1", ctx);
    expect(result.decision).toBe("OVERPAID");
    expect(result.amountAppliedToPot).toBe(2000);
    expect(result.amountToBuffer).toBe(1000);
    expect(result.contributionStatus).toBe("COMPLETE");
  });
});

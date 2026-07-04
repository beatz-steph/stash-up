import { describe, it, expect } from "vitest";
import {
  VERIFICATION_AMOUNT_MINOR,
  computeRemainingDue,
  isCollectibleStatus,
  shouldCollectNow,
  enrollOrderRef,
  verifyOrderRef,
  chargeOrderRef,
} from "./enrollment";

describe("computeRemainingDue (THE CORE COLLECTION RULE)", () => {
  it("returns the unpaid remainder", () => {
    expect(computeRemainingDue(1_000_000, 0)).toBe(1_000_000);
    expect(computeRemainingDue(1_000_000, 600_000)).toBe(400_000); // partial transfer
  });

  it("returns 0 when fully paid (no retry)", () => {
    expect(computeRemainingDue(1_000_000, 1_000_000)).toBe(0);
  });

  it("never returns negative when over-collected", () => {
    expect(computeRemainingDue(1_000_000, 1_200_000)).toBe(0);
  });
});

describe("isCollectibleStatus", () => {
  it("is true only for OPEN and COLLECTING", () => {
    expect(isCollectibleStatus("OPEN")).toBe(true);
    expect(isCollectibleStatus("COLLECTING")).toBe(true);
    for (const s of ["AWAITING_RESOLUTION", "READY_TO_PAYOUT", "PAID_OUT", "CLOSED"]) {
      expect(isCollectibleStatus(s)).toBe(false);
    }
  });
});

describe("shouldCollectNow", () => {
  it("collects only when collectible AND something is owed", () => {
    expect(shouldCollectNow("OPEN", 400_000)).toBe(true);
    expect(shouldCollectNow("COLLECTING", 1)).toBe(true);
    expect(shouldCollectNow("OPEN", 0)).toBe(false); // paid up
    expect(shouldCollectNow("PAID_OUT", 400_000)).toBe(false); // not collectible
  });
});

describe("orderReference builders", () => {
  it("tag each reference with a routable prefix", () => {
    expect(enrollOrderRef("cyc1", "mem1", "n")).toBe("cardenroll_cyc1_mem1_n");
    expect(verifyOrderRef("user1", "n")).toBe("cardverify_user1_n");
    expect(chargeOrderRef("cyc1", "mem1", 2)).toBe("cardchg_cyc1_mem1_a2");
  });
});

describe("constants", () => {
  it("verification hold is ₦50", () => {
    expect(VERIFICATION_AMOUNT_MINOR).toBe(5000);
  });
});

import { describe, it, expect } from "vitest";
import {
  VERIFICATION_AMOUNT_MINOR,
  computeRemainingDue,
  isCollectibleStatus,
  shouldCollectNow,
  enrollOrderRef,
  verifyOrderRef,
  chargeOrderRef,
  orderNonce,
  retryBackoffHours,
  computeNextAttempt,
  type PriorAttempt,
} from "./enrollment";

const HOUR = 60 * 60 * 1000;

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
    expect(enrollOrderRef("n")).toBe("cardenroll_n");
    expect(verifyOrderRef("n")).toBe("cardverify_n");
    expect(chargeOrderRef("n")).toBe("cardchg_n");
  });

  it("stay within Nomba's 50-char orderReference limit", () => {
    const nonce = orderNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    for (const ref of [enrollOrderRef(nonce), verifyOrderRef(nonce), chargeOrderRef(nonce)]) {
      expect(ref.length).toBeLessThanOrEqual(50);
    }
  });
});

describe("constants", () => {
  it("verification hold is ₦50", () => {
    expect(VERIFICATION_AMOUNT_MINOR).toBe(5000);
  });
});

describe("retryBackoffHours", () => {
  it("is 0 / 24h / 72h for attempts 1 / 2 / 3", () => {
    expect(retryBackoffHours(1)).toBe(0);
    expect(retryBackoffHours(2)).toBe(24);
    expect(retryBackoffHours(3)).toBe(72);
  });
});

describe("computeNextAttempt", () => {
  const now = Date.now();

  it("allows attempt 1 with no history", () => {
    expect(computeNextAttempt([], now)).toEqual({ eligible: true, attemptNumber: 1 });
  });

  it("blocks while an attempt is PENDING (no double-charge)", () => {
    const priors: PriorAttempt[] = [
      { attemptNumber: 1, status: "PENDING", createdAt: new Date(now - 48 * HOUR) },
    ];
    expect(computeNextAttempt(priors, now)).toEqual({ eligible: false, attemptNumber: 0 });
  });

  it("holds attempt 2 until 24h after attempt 1 failed", () => {
    const recent: PriorAttempt[] = [
      { attemptNumber: 1, status: "FAILED", createdAt: new Date(now - 1 * HOUR) },
    ];
    expect(computeNextAttempt(recent, now)).toEqual({ eligible: false, attemptNumber: 2 });

    const aged: PriorAttempt[] = [
      { attemptNumber: 1, status: "FAILED", createdAt: new Date(now - 25 * HOUR) },
    ];
    expect(computeNextAttempt(aged, now)).toEqual({ eligible: true, attemptNumber: 2 });
  });

  it("holds attempt 3 until 72h after attempt 2 failed", () => {
    const base: PriorAttempt[] = [
      { attemptNumber: 1, status: "FAILED", createdAt: new Date(now - 200 * HOUR) },
    ];
    const recent2 = [...base, { attemptNumber: 2, status: "FAILED", createdAt: new Date(now - 71 * HOUR) }];
    expect(computeNextAttempt(recent2, now)).toEqual({ eligible: false, attemptNumber: 3 });

    const aged2 = [...base, { attemptNumber: 2, status: "FAILED", createdAt: new Date(now - 73 * HOUR) }];
    expect(computeNextAttempt(aged2, now)).toEqual({ eligible: true, attemptNumber: 3 });
  });

  it("stops after MAX_ATTEMPTS (3)", () => {
    const priors: PriorAttempt[] = [1, 2, 3].map((n) => ({
      attemptNumber: n,
      status: "FAILED",
      createdAt: new Date(now - 1000 * HOUR),
    }));
    const res = computeNextAttempt(priors, now);
    expect(res.eligible).toBe(false);
    expect(res.attemptNumber).toBe(4);
  });
});

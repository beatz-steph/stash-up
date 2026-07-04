import { describe, it, expect } from "vitest";
import {
  CARD_FEE_RATE,
  transferFeeMinor,
  grossUpForCardFee,
  cardFeeOn,
} from "./fees";

describe("transferFeeMinor (tiered flat bank-transfer fee)", () => {
  it("applies the tier for the amount", () => {
    expect(transferFeeMinor(100_000)).toBe(1000); // ₦1,000 → tier 1 (₦10)
    expect(transferFeeMinor(500_000)).toBe(1000); // ₦5,000 boundary → tier 1
    expect(transferFeeMinor(500_001)).toBe(2500); // just over → tier 2 (₦25)
    expect(transferFeeMinor(5_000_000)).toBe(2500); // ₦50,000 boundary → tier 2
    expect(transferFeeMinor(5_000_001)).toBe(5000); // over → tier 3 (₦50)
    expect(transferFeeMinor(100_000_000)).toBe(5000);
  });
});

describe("grossUpForCardFee", () => {
  it("returns an amount that nets ≥ the intended contribution after the fee", () => {
    const net = 1_000_000; // ₦10,000
    const gross = grossUpForCardFee(net);
    expect(gross).toBeGreaterThan(net);
    // After Nomba takes its cut, at least `net` remains.
    expect(gross * (1 - CARD_FEE_RATE)).toBeGreaterThanOrEqual(net);
  });

  it("is a whole number of kobo (ceil)", () => {
    expect(Number.isInteger(grossUpForCardFee(333_333))).toBe(true);
  });

  it("passes through non-positive amounts", () => {
    expect(grossUpForCardFee(0)).toBe(0);
    expect(grossUpForCardFee(-5000)).toBe(-5000);
  });
});

describe("cardFeeOn", () => {
  it("is the gross-up delta", () => {
    const net = 250_000;
    expect(cardFeeOn(net)).toBe(grossUpForCardFee(net) - net);
    expect(cardFeeOn(net)).toBeGreaterThan(0);
  });
});

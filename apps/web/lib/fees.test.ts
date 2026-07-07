import { describe, it, expect } from "vitest";
import {
  CARD_FEE_RATE,
  transferFeeMinor,
  grossUpForCardFee,
  cardFeeOn,
} from "./fees";

describe("transferFeeMinor (flat bank-transfer fee)", () => {
  it("applies the flat fee regardless of the amount", () => {
    expect(transferFeeMinor(100_000)).toBe(2000);
    expect(transferFeeMinor(5_000_000)).toBe(2000);
    expect(transferFeeMinor(100_000_000)).toBe(2000);
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

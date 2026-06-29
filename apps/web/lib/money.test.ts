import { describe, it, expect } from "vitest";
import { minorToNaira, nairaToMinor } from "./money";

describe("Money Helpers", () => {
  it("converts minor to naira correctly", () => {
    expect(minorToNaira(100)).toBe(1);
    expect(minorToNaira(150)).toBe(1.5);
    expect(minorToNaira(105)).toBe(1.05);
    expect(minorToNaira(0)).toBe(0);
  });

  it("converts naira to minor correctly without float drift", () => {
    expect(nairaToMinor(1)).toBe(100);
    expect(nairaToMinor(1.5)).toBe(150);
    expect(nairaToMinor(1.05)).toBe(105);
    
    // JS float issue: 1.05 * 100 = 105.00000000000001
    // Our helper uses Math.round to handle this
    expect(nairaToMinor(1.05)).toBe(105);
    expect(nairaToMinor(0)).toBe(0);
  });
});

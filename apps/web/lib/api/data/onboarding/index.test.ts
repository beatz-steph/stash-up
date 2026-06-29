import { describe, it, expect } from "vitest";
import { fetchOnboardingStatus } from "./index";

describe("fetchOnboardingStatus", () => {
  it("fetches the onboarding status via MSW", async () => {
    const res = await fetchOnboardingStatus();
    expect(res).toEqual({ account: true, verified: true, withdrawal: false });
  });
});

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveBankAccount } from "./nomba-client";

// Mock redis
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("Nomba Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds Bearer prefix to Authorization header and resolves account", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    
    // Setup mock for token fetch
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { access_token: "test-token", refresh_token: "ref", expires_at: Date.now() + 100000 },
      }),
    } as unknown as Response);

    // Setup mock for resolveBankAccount
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: "00",
        data: { accountName: "Test Name" },
      }),
    } as unknown as Response);

    const res = await resolveBankAccount({ accountNumber: "123", bankCode: "058" });
    expect(res.accountName).toBe("Test Name");

    // The second fetch call is the resolve call.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const resolveCall = fetchSpy.mock.calls[1]!;
    expect(resolveCall[0]).toContain("/v1/transfers/bank/lookup");
    const headers = (resolveCall[1]?.headers as Record<string, string>) || {};
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });
});

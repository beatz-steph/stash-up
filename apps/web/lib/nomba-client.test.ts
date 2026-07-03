import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveBankAccount, decideTokenAction } from "./nomba-client";

// Mock redis
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

import { redis } from "@/lib/redis";

describe("Nomba Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: lock acquisition succeeds (SET NX -> "OK") so the blocking
    // token-fetch path doesn't fall into its 5s cross-instance poll loop.
    vi.mocked(redis.set).mockResolvedValue("OK" as never);
    vi.mocked(redis.eval).mockResolvedValue(1 as never);
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
        data: { access_token: "test-token", refresh_token: "ref" },
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

describe("decideTokenAction", () => {
  const now = 1_000_000;

  it("returns \"block\" when there is no cached token", () => {
    expect(decideTokenAction(null, now)).toBe("block");
  });

  it("returns \"block\" when the token is expired (now >= expires_at)", () => {
    const token = {
      access_token: "a",
      refresh_token: "r",
      expires_at: now - 1,
      refresh_after: now - 1000,
    };
    expect(decideTokenAction(token, now)).toBe("block");
  });

  it("returns \"use+refresh\" when the token is valid but past refresh_after", () => {
    const token = {
      access_token: "a",
      refresh_token: "r",
      expires_at: now + 60_000,
      refresh_after: now - 1,
    };
    expect(decideTokenAction(token, now)).toBe("use+refresh");
  });

  it("returns \"use\" when the token is comfortably valid", () => {
    const token = {
      access_token: "a",
      refresh_token: "r",
      expires_at: now + 60_000,
      refresh_after: now + 30_000,
    };
    expect(decideTokenAction(token, now)).toBe("use");
  });
});

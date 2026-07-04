import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveBankAccount,
  decideTokenAction,
  createCheckoutOrder,
  chargeTokenizedCard,
  refundCheckoutTransaction,
  koboToNaira,
} from "./nomba-client";

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

describe("Card rails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.set).mockResolvedValue("OK" as never);
    vi.mocked(redis.eval).mockResolvedValue(1 as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** First fetch = token issue; return it, then the real endpoint response. */
  function mockTokenThen(fetchSpy: ReturnType<typeof vi.spyOn>, response: unknown) {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { access_token: "test-token", refresh_token: "ref" } }),
    } as unknown as Response);
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => response,
    } as unknown as Response);
  }

  it("createCheckoutOrder forces Card-only, sub-account, and naira amount when tokenizing", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    mockTokenThen(fetchSpy, {
      data: { checkoutLink: "https://pay.nomba/abc", orderReference: "cardenroll_1" },
    });

    const res = await createCheckoutOrder({
      orderReference: "cardenroll_1",
      customerEmail: "a@b.com",
      amountMinor: 1_000_000, // ₦10,000
      callbackUrl: "https://app/cb",
      tokenizeCard: true,
      metadata: { kind: "cardenroll", userId: "u1" },
    });

    expect(res.checkoutLink).toBe("https://pay.nomba/abc");
    const call = fetchSpy.mock.calls[1]!;
    expect(call[0]).toContain("/v1/checkout/order");
    const body = JSON.parse((call[1]?.body as string) ?? "{}");
    expect(body.tokenizeCard).toBe(true);
    expect(body.order.allowedPaymentMethods).toEqual(["Card"]);
    expect(body.order.currency).toBe("NGN");
    expect(body.order.amount).toBe(10_000); // kobo → naira
    expect(body.order.accountId).toBe(process.env.NOMBA_SUB_ACCOUNT_ID);
    expect(body.order.orderMetaData).toEqual({ kind: "cardenroll", userId: "u1" });
  });

  it("createCheckoutOrder omits allowedPaymentMethods when not tokenizing", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    mockTokenThen(fetchSpy, {
      data: { checkoutLink: "https://pay.nomba/x", orderReference: "o" },
    });

    await createCheckoutOrder({
      orderReference: "o",
      customerEmail: "a@b.com",
      amountMinor: 5000,
      callbackUrl: "https://app/cb",
      tokenizeCard: false,
    });

    const body = JSON.parse((fetchSpy.mock.calls[1]![1]?.body as string) ?? "{}");
    expect(body.order.allowedPaymentMethods).toBeUndefined();
    expect(body.tokenizeCard).toBe(false);
  });

  it("chargeTokenizedCard sends X-Idempotent-key and never exposes tokenKey in the header", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    mockTokenThen(fetchSpy, { data: { status: true, message: "ok" } });

    const res = await chargeTokenizedCard({
      orderReference: "cardchg_c1_m1_a1",
      customerEmail: "a@b.com",
      amountMinor: 250_000,
      tokenKey: "SECRET_TOKEN_KEY",
      metadata: { kind: "cardchg" },
    });

    expect(res.status).toBe(true);
    const call = fetchSpy.mock.calls[1]!;
    expect(call[0]).toContain("/v1/checkout/tokenized-card-payment");
    const headers = (call[1]?.headers as Record<string, string>) || {};
    expect(headers["X-Idempotent-key"]).toBe("cardchg_c1_m1_a1");
    // tokenKey travels only in the request body, never in headers.
    expect(JSON.stringify(headers)).not.toContain("SECRET_TOKEN_KEY");
    const body = JSON.parse((call[1]?.body as string) ?? "{}");
    expect(body.tokenKey).toBe("SECRET_TOKEN_KEY");
    expect(body.order.amount).toBe(2500);
  });

  it("refundCheckoutTransaction keys on transactionId with a naira amount", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    mockTokenThen(fetchSpy, { data: { success: true, message: "refunded" } });

    const res = await refundCheckoutTransaction({ transactionId: "txn_123", amountMinor: 5000 });

    expect(res.success).toBe(true);
    const call = fetchSpy.mock.calls[1]!;
    expect(call[0]).toContain("/v1/checkout/refund");
    const body = JSON.parse((call[1]?.body as string) ?? "{}");
    expect(body.transactionId).toBe("txn_123");
    expect(body.amount).toBe(50); // ₦50
    expect(body.accountNumber).toBeUndefined(); // refund to source
  });

  it("koboToNaira converts minor units to naira", () => {
    expect(koboToNaira(1_000_000)).toBe(10_000);
    expect(koboToNaira(5000)).toBe(50);
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

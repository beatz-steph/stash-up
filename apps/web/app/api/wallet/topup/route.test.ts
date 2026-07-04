import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { getSession } from "@/lib/session";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { createCheckoutOrder } from "@/lib/nomba-client";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));
vi.mock("@/lib/nomba-client", () => ({ createCheckoutOrder: vi.fn() }));

function req(body: unknown) {
  return new NextRequest("http://localhost/api/wallet/topup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/wallet/topup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(false);
    vi.mocked(createCheckoutOrder).mockResolvedValue({
      checkoutLink: "https://pay.nomba/topup",
      orderReference: "ref",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(req({ amountMinor: 100_000 }))).status).toBe(401);
  });

  it("returns 422 below the ₦100 minimum", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    expect((await POST(req({ amountMinor: 5000 }))).status).toBe(422);
  });

  it("returns 503 when Nomba is disabled", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(true);
    expect((await POST(req({ amountMinor: 100_000 }))).status).toBe(503);
  });

  it("charges the grossed-up amount and credits the requested net", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    const res = await POST(req({ amountMinor: 1_000_000 })); // ₦10,000 net
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.netMinor).toBe(1_000_000);
    expect(data.chargedMinor).toBeGreaterThan(1_000_000); // grossed up for the fee
    expect(data.feeMinor).toBe(data.chargedMinor - data.netMinor);

    const orderArg = vi.mocked(createCheckoutOrder).mock.calls[0]![0];
    expect(orderArg.amountMinor).toBe(data.chargedMinor);
    expect(orderArg.tokenizeCard).toBe(false);
    expect(orderArg.metadata).toMatchObject({ kind: "wallettopup", userId: "u1", netMinor: "1000000" });
  });
});

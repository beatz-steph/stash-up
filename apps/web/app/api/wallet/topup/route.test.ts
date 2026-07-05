import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { getSession } from "@/lib/session";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { createCheckoutOrder, chargeTokenizedCard } from "@/lib/nomba-client";
import { prisma } from "@workspace/db";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));
vi.mock("@/lib/nomba-client", () => ({
  createCheckoutOrder: vi.fn(),
  chargeTokenizedCard: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  prisma: {
    savedCard: { findUnique: vi.fn(), update: vi.fn() },
    chargeAttempt: { create: vi.fn(), update: vi.fn() },
  },
}));

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
    vi.mocked(prisma.chargeAttempt.create).mockResolvedValue({ id: "att1" } as never);
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

  it("new card: hosted checkout, grossed-up charge, short orderReference", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    const res = await POST(req({ amountMinor: 1_000_000 })); // ₦10,000 net
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.mode).toBe("checkout");
    expect(data.checkoutLink).toBe("https://pay.nomba/topup");
    expect(data.netMinor).toBe(1_000_000);
    expect(data.chargedMinor).toBeGreaterThan(1_000_000); // grossed up for the fee
    expect(data.feeMinor).toBe(data.chargedMinor - data.netMinor);

    const orderArg = vi.mocked(createCheckoutOrder).mock.calls[0]![0];
    expect(orderArg.amountMinor).toBe(data.chargedMinor);
    // Tokenizing forces the hosted checkout to card-only AND saves the card.
    expect(orderArg.tokenizeCard).toBe(true);
    expect(orderArg.metadata).toMatchObject({ kind: "wallettopup", userId: "u1", netMinor: "1000000" });
    // Nomba caps orderReference at 50 chars.
    expect(orderArg.orderReference.length).toBeLessThanOrEqual(50);
    expect(orderArg.orderReference).toMatch(/^wallettopup_/);
    expect(chargeTokenizedCard).not.toHaveBeenCalled();
  });

  it("saved card: charges the token server-side, no checkout link", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      userId: "u1",
      status: "ACTIVE",
      tokenKey: "TK_SECRET",
    } as never);
    vi.mocked(chargeTokenizedCard).mockResolvedValue({ status: true, message: "Approved", otpRequired: false, orderId: null, orderReference: "ref" });

    const res = await POST(req({ amountMinor: 1_000_000, savedCardId: "card1" }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.mode).toBe("charged");
    expect(data.checkoutLink).toBeNull();

    const chargeArg = vi.mocked(chargeTokenizedCard).mock.calls[0]![0];
    expect(chargeArg.tokenKey).toBe("TK_SECRET");
    expect(chargeArg.amountMinor).toBe(data.chargedMinor);
    expect(chargeArg.orderReference.length).toBeLessThanOrEqual(50);
    expect(chargeArg.metadata).toMatchObject({ kind: "wallettopup", userId: "u1" });
    expect(createCheckoutOrder).not.toHaveBeenCalled();

    // Durable record so a missed settlement webhook is reconcilable by the sweep.
    const attemptArg = vi.mocked(prisma.chargeAttempt.create).mock.calls[0]![0];
    expect(attemptArg.data).toMatchObject({
      userId: "u1",
      purpose: "TOPUP",
      status: "PENDING",
      orderReference: chargeArg.orderReference,
    });
  });

  it("saved card: returns otp_required (with a handle) when the charge is 3DS-gated", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      userId: "u1",
      status: "ACTIVE",
      tokenKey: "TK_SECRET",
    } as never);
    vi.mocked(chargeTokenizedCard).mockResolvedValue({
      status: true,
      message: "Kindly enter the OTP sent to your phone",
      otpRequired: true,
      orderId: "ord-999",
      orderReference: "wallettopup_x",
    });
    const res = await POST(req({ amountMinor: 1_000_000, savedCardId: "card1" }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.mode).toBe("otp_required");
    expect(data.otp).toMatchObject({ transactionId: "ord-999" });
    expect(data.otp.orderReference).toMatch(/^wallettopup_/);
    // Attempt stays PENDING — it settles after the OTP is submitted.
    expect(prisma.chargeAttempt.update).not.toHaveBeenCalled();
  });

  it("saved card: 502 and marks the durable attempt FAILED when the charge throws", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      userId: "u1",
      status: "ACTIVE",
      tokenKey: "TK_SECRET",
    } as never);
    vi.mocked(chargeTokenizedCard).mockRejectedValue(new Error("nomba down"));

    const res = await POST(req({ amountMinor: 1_000_000, savedCardId: "card1" }));
    expect(res.status).toBe(502);
    expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "att1" }, data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("saved card: 404 when the card isn't the user's", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      userId: "someone-else",
      status: "ACTIVE",
      tokenKey: "TK",
    } as never);
    expect((await POST(req({ amountMinor: 1_000_000, savedCardId: "card1" }))).status).toBe(404);
  });

  it("saved card: 409 + retires a placeholder-token card (never truly tokenized)", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      userId: "u1",
      status: "ACTIVE",
      tokenKey: "N/A",
    } as never);
    const res = await POST(req({ amountMinor: 1_000_000, savedCardId: "card1" }));
    expect(res.status).toBe(409);
    expect(chargeTokenizedCard).not.toHaveBeenCalled();
    expect(prisma.savedCard.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "card1" }, data: { status: "EXPIRED" } })
    );
  });

  it("saved card: 409 when the card is not ACTIVE", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      userId: "u1",
      status: "EXPIRED",
      tokenKey: "TK",
    } as never);
    expect((await POST(req({ amountMinor: 1_000_000, savedCardId: "card1" }))).status).toBe(409);
  });
});

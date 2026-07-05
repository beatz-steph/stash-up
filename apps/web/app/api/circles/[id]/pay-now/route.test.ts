import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { chargeTokenizedCard } from "@/lib/nomba-client";
import { collectFromWallet } from "@/lib/wallet/waterfall";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));
vi.mock("@/lib/nomba-client", () => ({ chargeTokenizedCard: vi.fn() }));
vi.mock("@/lib/wallet/waterfall", () => ({ collectFromWallet: vi.fn() }));
vi.mock("@workspace/db", () => ({
  prisma: {
    membership: { findUnique: vi.fn() },
    circle: { findUnique: vi.fn() },
    cycle: { findUnique: vi.fn() },
    savedCard: { findUnique: vi.fn() },
    chargeAttempt: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

function req(body: unknown) {
  return new NextRequest("http://localhost/api/circles/c1/pay-now", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const params = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
  vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(false);
  vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", role: "MEMBER" } as never);
  vi.mocked(prisma.circle.findUnique).mockResolvedValue({
    contributionMinor: 1_000_000,
    currentCycleSeq: 1,
    status: "ACTIVE",
  } as never);
  vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
    id: "cyc1",
    status: "OPEN",
    contributions: [{ amountMinor: 600_000 }], // paid 6k of 10k → owes 4k
  } as never);
  vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
    id: "card1",
    userId: "u1",
    status: "ACTIVE",
    tokenKey: "SECRET",
  } as never);
  vi.mocked(prisma.chargeAttempt.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.chargeAttempt.create).mockResolvedValue({ id: "att1" } as never);
  vi.mocked(collectFromWallet).mockResolvedValue({ debitedMinor: 400_000, remainingDueMinor: 0 });
});

describe("POST /api/circles/[id]/pay-now", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(req({ method: "WALLET" }), params)).status).toBe(401);
  });

  it("403 for a non-member", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);
    expect((await POST(req({ method: "WALLET" }), params)).status).toBe(403);
  });

  it("422 without a valid method", async () => {
    expect((await POST(req({}), params)).status).toBe(422);
    expect((await POST(req({ method: "CARD" }), params)).status).toBe(422); // missing savedCardId
  });

  it("409 when already paid up this cycle", async () => {
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      id: "cyc1",
      status: "OPEN",
      contributions: [{ amountMinor: 1_000_000 }], // fully paid
    } as never);
    expect((await POST(req({ method: "WALLET" }), params)).status).toBe(409);
  });

  describe("WALLET", () => {
    it("debits the wallet toward the contribution", async () => {
      const res = await POST(req({ method: "WALLET" }), params);
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data).toMatchObject({ method: "WALLET", status: "APPLIED", debitedMinor: 400_000, remainingDueMinor: 0 });
      expect(collectFromWallet).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u1", membershipId: "m1", cycleId: "cyc1", contributionMinor: 1_000_000 })
      );
      expect(chargeTokenizedCard).not.toHaveBeenCalled();
    });

    it("400 when the wallet is empty", async () => {
      vi.mocked(collectFromWallet).mockResolvedValue({ debitedMinor: 0, remainingDueMinor: 400_000 });
      expect((await POST(req({ method: "WALLET" }), params)).status).toBe(400);
    });
  });

  describe("CARD", () => {
    it("charges the saved card grossed-up for the remaining due", async () => {
      vi.mocked(chargeTokenizedCard).mockResolvedValue({ status: "success" } as never);
      const res = await POST(req({ method: "CARD", savedCardId: "card1" }), params);
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data).toMatchObject({ method: "CARD", status: "CHARGING", remainingDueMinor: 400_000 });

      const chargeArg = vi.mocked(chargeTokenizedCard).mock.calls[0]![0];
      expect(chargeArg.tokenKey).toBe("SECRET");
      expect(chargeArg.amountMinor).toBe(405_680); // ceil(400000 / (1 − 0.014))
      expect(chargeArg.metadata).toMatchObject({ kind: "cardchg", cycleId: "cyc1", membershipId: "m1" });
      expect(collectFromWallet).not.toHaveBeenCalled();
    });

    it("404 when the card isn't the user's", async () => {
      vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
        id: "card1", userId: "someone-else", status: "ACTIVE", tokenKey: "X",
      } as never);
      expect((await POST(req({ method: "CARD", savedCardId: "card1" }), params)).status).toBe(404);
    });

    it("409 when a card charge is already in flight", async () => {
      vi.mocked(prisma.chargeAttempt.findFirst).mockResolvedValueOnce({ id: "pending" } as never);
      expect((await POST(req({ method: "CARD", savedCardId: "card1" }), params)).status).toBe(409);
    });

    it("502 and marks the attempt FAILED when the charge throws", async () => {
      vi.mocked(chargeTokenizedCard).mockRejectedValue(new Error("nomba down"));
      vi.mocked(prisma.chargeAttempt.update).mockResolvedValue({} as never);
      expect((await POST(req({ method: "CARD", savedCardId: "card1" }), params)).status).toBe(502);
      expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
      );
    });

    it("503 when Nomba is disabled", async () => {
      vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(true);
      expect((await POST(req({ method: "CARD", savedCardId: "card1" }), params)).status).toBe(503);
    });
  });
});

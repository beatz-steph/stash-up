import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { collectFromWallet } from "@/lib/wallet/waterfall";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/wallet/waterfall", () => ({ collectFromWallet: vi.fn() }));
vi.mock("@workspace/db", () => ({
  prisma: {
    membership: { findUnique: vi.fn(), update: vi.fn() },
    circle: { findUnique: vi.fn() },
    cycle: { findUnique: vi.fn() },
    contribution: { findUnique: vi.fn() },
  },
}));

const params = { params: Promise.resolve({ id: "c1" }) };
function req(body: unknown) {
  return new NextRequest("http://localhost/api/circles/c1/auto-debit/wallet", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", role: "MEMBER" } as never);
  vi.mocked(prisma.membership.update).mockResolvedValue({} as never);
  vi.mocked(collectFromWallet).mockResolvedValue({ debitedMinor: 0, remainingDueMinor: 0 });
});

describe("POST /api/circles/[id]/auto-debit/wallet", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(req({ enabled: true }), params)).status).toBe(401);
  });

  it("turning off just updates the flag (no collection)", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    const res = await POST(req({ enabled: false }), params);
    const { data } = await res.json();
    expect(data.autoDebitWallet).toBe(false);
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { autoDebitWallet: false },
    });
    expect(collectFromWallet).not.toHaveBeenCalled();
  });

  it("turning on collects immediately when the member owes on an open cycle", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      contributionMinor: 1_000_000,
      currentCycleSeq: 1,
    } as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cyc1", status: "COLLECTING" } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 0 } as never);
    vi.mocked(collectFromWallet).mockResolvedValue({ debitedMinor: 400_000, remainingDueMinor: 600_000 });

    const res = await POST(req({ enabled: true }), params);
    const { data } = await res.json();
    expect(data.autoDebitWallet).toBe(true);
    expect(data.collectedMinor).toBe(400_000);
    expect(collectFromWallet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", membershipId: "m1", cycleId: "cyc1", contributionMinor: 1_000_000 })
    );
  });

  it("turning on does not collect when already paid up", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      contributionMinor: 1_000_000,
      currentCycleSeq: 1,
    } as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cyc1", status: "COLLECTING" } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 1_000_000 } as never);

    const res = await POST(req({ enabled: true }), params);
    const { data } = await res.json();
    expect(data.collectedMinor).toBe(0);
    expect(collectFromWallet).not.toHaveBeenCalled();
  });
});

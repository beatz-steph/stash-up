import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, DELETE } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { chargeTokenizedCard } from "@/lib/nomba-client";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/nomba-client", () => ({ chargeTokenizedCard: vi.fn() }));
vi.mock("@workspace/db", () => ({
  prisma: {
    membership: { findUnique: vi.fn(), update: vi.fn() },
    savedCard: { findUnique: vi.fn() },
    circle: { findUnique: vi.fn() },
    cycle: { findUnique: vi.fn() },
    chargeAttempt: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/circles/c1/auto-debit", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const params = { params: Promise.resolve({ id: "c1" }) };

describe("POST /api/circles/[id]/auto-debit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", role: "MEMBER" } as never);
    vi.mocked(prisma.membership.update).mockResolvedValue({} as never);
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      id: "card1",
      userId: "u1",
      status: "ACTIVE",
      tokenKey: "SECRET",
    } as never);
    vi.mocked(prisma.chargeAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.chargeAttempt.create).mockResolvedValue({ id: "att-1" } as never);
    vi.mocked(chargeTokenizedCard).mockResolvedValue({ status: true, message: "ok" });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(postReq({ savedCardId: "card1" }), params);
    expect(res.status).toBe(401);
  });

  it("binds the card and immediately charges the remainder on an open cycle", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      contributionMinor: 1_000_000,
      currentCycleSeq: 1,
    } as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      id: "cyc1",
      status: "COLLECTING",
      contributions: [{ amountMinor: 250_000 }], // owes 7.5k
    } as never);

    const res = await POST(postReq({ savedCardId: "card1" }), params);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.autoDebitCardId).toBe("card1");
    expect(data.chargeInitiated).toBe(true);
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { autoDebitCardId: "card1" },
    });
    const chargeArg = vi.mocked(chargeTokenizedCard).mock.calls[0]![0];
    expect(chargeArg.amountMinor).toBe(750_000);
    expect(chargeArg.tokenKey).toBe("SECRET");
  });

  it("binds without charging when the member is already paid up", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      contributionMinor: 1_000_000,
      currentCycleSeq: 1,
    } as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      id: "cyc1",
      status: "OPEN",
      contributions: [{ amountMinor: 1_000_000 }],
    } as never);

    const res = await POST(postReq({ savedCardId: "card1" }), params);
    const { data } = await res.json();
    expect(data.chargeInitiated).toBe(false);
    expect(chargeTokenizedCard).not.toHaveBeenCalled();
  });

  it("does not charge while a PENDING attempt is already in flight", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      contributionMinor: 1_000_000,
      currentCycleSeq: 1,
    } as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      id: "cyc1",
      status: "OPEN",
      contributions: [{ amountMinor: 0 }],
    } as never);
    vi.mocked(prisma.chargeAttempt.findFirst).mockResolvedValue({ id: "inflight" } as never);

    const res = await POST(postReq({ savedCardId: "card1" }), params);
    const { data } = await res.json();
    expect(data.chargeInitiated).toBe(false);
    expect(chargeTokenizedCard).not.toHaveBeenCalled();
  });

  it("returns 404 when the card is not owned by the user", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      id: "card1",
      userId: "someone-else",
      status: "ACTIVE",
      tokenKey: "x",
    } as never);
    const res = await POST(postReq({ savedCardId: "card1" }), params);
    expect(res.status).toBe(404);
  });

  it("returns 409 when the card is not ACTIVE", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      id: "card1",
      userId: "u1",
      status: "EXPIRED",
      tokenKey: "x",
    } as never);
    const res = await POST(postReq({ savedCardId: "card1" }), params);
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/circles/[id]/auto-debit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", role: "MEMBER" } as never);
    vi.mocked(prisma.membership.update).mockResolvedValue({} as never);
  });

  it("unbinds the card for this circle only", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    const res = await DELETE(new NextRequest("http://localhost", { method: "DELETE" }), params);
    expect(res.status).toBe(200);
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { autoDebitCardId: null },
    });
  });
});

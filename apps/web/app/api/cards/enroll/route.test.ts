import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createCheckoutOrder } from "@/lib/nomba-client";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/nomba-client", () => ({ createCheckoutOrder: vi.fn() }));
vi.mock("@workspace/db", () => ({
  prisma: {
    membership: { findUnique: vi.fn() },
    circle: { findUnique: vi.fn() },
    cycle: { findUnique: vi.fn() },
    chargeAttempt: { upsert: vi.fn(), create: vi.fn() },
  },
}));

function reqWith(body: unknown) {
  return new NextRequest("http://localhost/api/cards/enroll", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/cards/enroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCheckoutOrder).mockResolvedValue({
      checkoutLink: "https://pay.nomba/xyz",
      orderReference: "ref",
    });
    vi.mocked(prisma.chargeAttempt.upsert).mockResolvedValue({ id: "att-1" } as never);
    vi.mocked(prisma.chargeAttempt.create).mockResolvedValue({ id: "att-2" } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(reqWith({}));
    expect(res.status).toBe(401);
  });

  it("Path B: contribution mode charges the remaining due when the cycle is open", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", role: "MEMBER" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "c1",
      contributionMinor: 1_000_000,
      currentCycleSeq: 1,
    } as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      id: "cyc1",
      status: "OPEN",
      contributions: [{ amountMinor: 600_000 }], // paid 6k, owes 4k
    } as never);

    const res = await POST(reqWith({ circleId: "c1" }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.mode).toBe("contribution");
    // Grossed up so the NET after Nomba's card fee covers the ₦4,000 owed.
    expect(data.amountMinor).toBe(405_680); // ceil(400000 / (1 − 0.014))

    const orderArg = vi.mocked(createCheckoutOrder).mock.calls[0]![0];
    expect(orderArg.tokenizeCard).toBe(true);
    expect(orderArg.amountMinor).toBe(405_680);
    expect(orderArg.metadata?.kind).toBe("cardenroll");
    expect(prisma.chargeAttempt.upsert).toHaveBeenCalled();
  });

  it("Path B: verification mode (₦50) when the member is already paid up", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", role: "MEMBER" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "c1",
      contributionMinor: 1_000_000,
      currentCycleSeq: 1,
    } as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      id: "cyc1",
      status: "OPEN",
      contributions: [{ amountMinor: 1_000_000 }], // fully paid
    } as never);

    const res = await POST(reqWith({ circleId: "c1" }));
    const { data } = await res.json();
    expect(data.mode).toBe("verification");
    expect(data.amountMinor).toBe(5000);
    const orderArg = vi.mocked(createCheckoutOrder).mock.calls[0]![0];
    expect(orderArg.metadata?.kind).toBe("cardverify");
  });

  it("Path C: no circleId always uses ₦50 verification with no cycle/membership", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));

    const res = await POST(reqWith({}));
    const { data } = await res.json();
    expect(data.mode).toBe("verification");
    expect(data.amountMinor).toBe(5000);
    expect(prisma.chargeAttempt.create).toHaveBeenCalled();
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    const createArg = vi.mocked(prisma.chargeAttempt.create).mock.calls[0]![0];
    expect(createArg.data.cycleId).toBeUndefined();
    expect(createArg.data.membershipId).toBeUndefined();
  });

  it("returns 403 when the user is not a member of the circle", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);
    const res = await POST(reqWith({ circleId: "c1" }));
    expect(res.status).toBe(403);
  });
});

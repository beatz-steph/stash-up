import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));

vi.mock("@/lib/circles/activation", () => ({
  calculateDeadline: vi.fn(() => new Date("2026-08-01T00:00:00.000Z")),
}));

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      membership: { findUnique: vi.fn(), update: vi.fn() },
      circle: { findUnique: vi.fn(), update: vi.fn() },
      cycle: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      contribution: { create: vi.fn() },
      $transaction: vi.fn((fn) => fn(prisma)),
    },
  };
});

function req() {
  return new NextRequest("http://localhost", { method: "POST" });
}

const activeMembers = [
  { id: "mem-1", payoutPosition: 1, status: "ACTIVE", bufferMinor: 0 },
  { id: "mem-2", payoutPosition: 2, status: "ACTIVE", bufferMinor: 0 },
];

describe("/api/circles/[id]/renew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 if not the creator", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "MEMBER" } as never);

    const res = await POST(req(), { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 if the circle is not COMPLETED", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "circle-1",
      status: "ACTIVE",
      totalSlots: 2,
      currentCycleSeq: 2,
      contributionMinor: 10000,
      frequency: "WEEKLY",
      memberships: activeMembers,
    } as never);

    const res = await POST(req(), { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 if any membership is no longer ACTIVE", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "circle-1",
      status: "COMPLETED",
      totalSlots: 2,
      currentCycleSeq: 2,
      contributionMinor: 10000,
      frequency: "WEEKLY",
      memberships: [
        { id: "mem-1", payoutPosition: 1, status: "ACTIVE", bufferMinor: 0 },
        { id: "mem-2", payoutPosition: 2, status: "SUSPENDED", bufferMinor: 0 },
      ],
    } as never);

    const res = await POST(req(), { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(400);
  });

  it("happy path: creates cycle seq N+1, recipient at payoutPosition 1, sets circle ACTIVE, increments renewalCount", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "circle-1",
      status: "COMPLETED",
      totalSlots: 2,
      currentCycleSeq: 2,
      contributionMinor: 10000,
      frequency: "WEEKLY",
      memberships: activeMembers,
    } as never);
    vi.mocked(prisma.cycle.create).mockResolvedValue({ id: "cycle-3", sequence: 3 } as never);
    vi.mocked(prisma.circle.update).mockResolvedValue({} as never);

    const res = await POST(req(), { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(200);

    expect(prisma.cycle.create).toHaveBeenCalledWith({
      data: {
        circleId: "circle-1",
        sequence: 3, // currentCycleSeq (2) + 1
        recipientMembershipId: "mem-1", // payoutPosition 1
        potExpectedMinor: 20000, // 2 active members * 10000
        deadline: new Date("2026-08-01T00:00:00.000Z"),
        status: "OPEN",
      },
    });

    expect(prisma.circle.update).toHaveBeenCalledWith({
      where: { id: "circle-1" },
      data: {
        status: "ACTIVE",
        currentCycleSeq: 3,
        renewalCount: { increment: 1 },
      },
    });

    const { data } = await res.json();
    expect(data).toEqual({ cycleId: "cycle-3", sequence: 3 });
  });

  it("applies carried-over buffers to the fresh cycle (reuses applyBuffersToNewCycle)", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "circle-1",
      status: "COMPLETED",
      totalSlots: 2,
      currentCycleSeq: 2,
      contributionMinor: 10000,
      frequency: "WEEKLY",
      memberships: [
        { id: "mem-1", payoutPosition: 1, status: "ACTIVE", bufferMinor: 5000 },
        { id: "mem-2", payoutPosition: 2, status: "ACTIVE", bufferMinor: 0 },
      ],
    } as never);
    vi.mocked(prisma.cycle.create).mockResolvedValue({ id: "cycle-3", sequence: 3 } as never);
    vi.mocked(prisma.circle.update).mockResolvedValue({} as never);
    vi.mocked(prisma.contribution.create).mockResolvedValue({} as never);
    vi.mocked(prisma.membership.update).mockResolvedValue({} as never);
    vi.mocked(prisma.cycle.update).mockResolvedValue({} as never);

    const res = await POST(req(), { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(200);

    expect(prisma.contribution.create).toHaveBeenCalledWith({
      data: { cycleId: "cycle-3", membershipId: "mem-1", amountMinor: 5000, status: "PARTIAL" },
    });
    expect(prisma.membership.update).toHaveBeenCalledWith({
      where: { id: "mem-1" },
      data: { bufferMinor: { decrement: 5000 } },
    });
  });
});

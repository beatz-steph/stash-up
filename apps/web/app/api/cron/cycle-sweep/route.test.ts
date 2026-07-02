import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@workspace/db";

vi.mock("@workspace/db", () => ({
  prisma: {
    cycle: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contribution: {
      upsert: vi.fn(),
    },
    membership: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => cb(prisma)),
  },
}));

describe("GET /api/cron/cycle-sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "secret";
  });

  const createRequest = (authHeader: string | null) => {
    const headers = new Headers();
    if (authHeader) headers.set("authorization", authHeader);
    return new Request("http://localhost:3000/api/cron/cycle-sweep", { headers });
  };

  it("rejects unauthorized requests without CRON_SECRET", async () => {
    const req = createRequest(null);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns early if no overdue cycles are found", async () => {
    vi.mocked(prisma.cycle.findMany).mockResolvedValue([]);
    
    const req = createRequest("Bearer secret");
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.swept).toBe(0);
  });

  it("marks missing or partial contributions as DEFAULTED and sets cycle to AWAITING_RESOLUTION", async () => {
    const mockCycle = {
      id: "cy-1",
      status: "OPEN",
      circle: {
        memberships: [
          { id: "mem-1" }, // missing contribution entirely
          { id: "mem-2" }, // has complete contribution
          { id: "mem-3" }, // has partial contribution
        ],
      },
      contributions: [
        { membershipId: "mem-2", status: "COMPLETE", amountMinor: 5000 },
        { membershipId: "mem-3", status: "PARTIAL", amountMinor: 2000 },
      ]
    };

    vi.mocked(prisma.cycle.findMany).mockResolvedValue([mockCycle as never]);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue(mockCycle as never);

    const req = createRequest("Bearer secret");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.swept).toBe(1);

    // mem-1 and mem-3 should be upserted to DEFAULTED
    expect(prisma.contribution.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.contribution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cycleId_membershipId: { cycleId: "cy-1", membershipId: "mem-1" } },
        update: { status: "DEFAULTED" },
      })
    );
    expect(prisma.contribution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cycleId_membershipId: { cycleId: "cy-1", membershipId: "mem-3" } },
        update: { status: "DEFAULTED" },
      })
    );

    // Default counts incremented
    expect(prisma.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["mem-1", "mem-3"] } },
        data: { defaultCount: { increment: 1 } },
      })
    );

    // Cycle flipped to AWAITING_RESOLUTION
    expect(prisma.cycle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cy-1" },
        data: { status: "AWAITING_RESOLUTION" },
      })
    );
  });

  it("is idempotent: skips cycle if status flipped during tx race", async () => {
    const mockCycle = { id: "cy-1", status: "OPEN" };
    
    vi.mocked(prisma.cycle.findMany).mockResolvedValue([mockCycle as never]);
    // The re-check returns READY_TO_PAYOUT (e.g. concurrent completion)
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cy-1", status: "READY_TO_PAYOUT" } as never);

    const req = createRequest("Bearer secret");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.contribution.upsert).not.toHaveBeenCalled();
    expect(prisma.cycle.update).not.toHaveBeenCalled();
  });
});

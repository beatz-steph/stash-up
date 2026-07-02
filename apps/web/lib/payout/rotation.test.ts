import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@workspace/db";
import { advanceRotation } from "./rotation";

vi.mock("@/lib/circles/activation", () => ({
  calculateDeadline: vi.fn(() => new Date("2026-08-01T00:00:00.000Z")),
}));

describe("advanceRotation", () => {
  it("marks circle as COMPLETED if it is the last cycle", async () => {
    const mockTx = {
      circle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          totalSlots: 5,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    await advanceRotation(mockTx as unknown as Prisma.TransactionClient, "circle-1", { sequence: 5 });

    expect(mockTx.circle.update).toHaveBeenCalledWith({
      where: { id: "circle-1" },
      data: { status: "COMPLETED" },
    });
  });

  it("advances rotation to the next sequence", async () => {
    const mockTx = {
      circle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          totalSlots: 5,
          contributionMinor: 10000,
          frequency: "WEEKLY",
          memberships: [
            { id: "mem-1", payoutPosition: 1, status: "ACTIVE" },
            { id: "mem-2", payoutPosition: 2, status: "ACTIVE" },
            { id: "mem-3", payoutPosition: 3, status: "SUSPENDED" }, // Pot will only be 20000
          ],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      cycle: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };

    await advanceRotation(mockTx as unknown as Prisma.TransactionClient, "circle-1", { sequence: 1 });

    expect(mockTx.cycle.create).toHaveBeenCalledWith({
      data: {
        circleId: "circle-1",
        sequence: 2,
        recipientMembershipId: "mem-2",
        potExpectedMinor: 20000, // 2 active members
        deadline: new Date("2026-08-01T00:00:00.000Z"),
        status: "OPEN",
      },
    });

    expect(mockTx.circle.update).toHaveBeenCalledWith({
      where: { id: "circle-1" },
      data: { currentCycleSeq: 2 },
    });
  });

  it("auto-applies carried-over buffer to the new cycle (partial → COLLECTING)", async () => {
    const mockTx = {
      circle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          totalSlots: 5,
          contributionMinor: 10000,
          frequency: "WEEKLY",
          memberships: [
            { id: "mem-1", payoutPosition: 1, status: "ACTIVE", bufferMinor: 25000 }, // caps at 10000
            { id: "mem-2", payoutPosition: 2, status: "ACTIVE", bufferMinor: 4000 }, // partial
          ],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      cycle: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "cycle-2" }),
        update: vi.fn().mockResolvedValue({}),
      },
      contribution: { create: vi.fn().mockResolvedValue({}) },
      membership: { update: vi.fn().mockResolvedValue({}) },
    };

    await advanceRotation(mockTx as unknown as Prisma.TransactionClient, "circle-1", { sequence: 1 });

    // mem-1 buffer (25000) is capped to one contribution (10000) → COMPLETE
    expect(mockTx.contribution.create).toHaveBeenCalledWith({
      data: { cycleId: "cycle-2", membershipId: "mem-1", amountMinor: 10000, status: "COMPLETE" },
    });
    expect(mockTx.membership.update).toHaveBeenCalledWith({
      where: { id: "mem-1" },
      data: { bufferMinor: { decrement: 10000 } },
    });

    // mem-2 buffer (4000) is a partial contribution → PARTIAL
    expect(mockTx.contribution.create).toHaveBeenCalledWith({
      data: { cycleId: "cycle-2", membershipId: "mem-2", amountMinor: 4000, status: "PARTIAL" },
    });
    expect(mockTx.membership.update).toHaveBeenCalledWith({
      where: { id: "mem-2" },
      data: { bufferMinor: { decrement: 4000 } },
    });

    // pot = 10000 + 4000 = 14000, expected 20000 → still COLLECTING
    expect(mockTx.cycle.update).toHaveBeenCalledWith({
      where: { id: "cycle-2" },
      data: { potCollectedMinor: 14000, status: "COLLECTING" },
    });
  });

  it("flips the new cycle to READY_TO_PAYOUT when buffers cover the whole pot", async () => {
    const mockTx = {
      circle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          totalSlots: 5,
          contributionMinor: 10000,
          frequency: "WEEKLY",
          memberships: [
            { id: "mem-1", payoutPosition: 1, status: "ACTIVE", bufferMinor: 10000 },
            { id: "mem-2", payoutPosition: 2, status: "ACTIVE", bufferMinor: 15000 },
          ],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      cycle: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "cycle-2" }),
        update: vi.fn().mockResolvedValue({}),
      },
      contribution: { create: vi.fn().mockResolvedValue({}) },
      membership: { update: vi.fn().mockResolvedValue({}) },
    };

    await advanceRotation(mockTx as unknown as Prisma.TransactionClient, "circle-1", { sequence: 1 });

    // both fully covered (10000 each) → pot 20000 >= expected 20000
    expect(mockTx.cycle.update).toHaveBeenCalledWith({
      where: { id: "cycle-2" },
      data: { potCollectedMinor: 20000, status: "READY_TO_PAYOUT" },
    });
  });

  it("does not create contributions or touch the pot when no member has a buffer", async () => {
    const mockTx = {
      circle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          totalSlots: 5,
          contributionMinor: 10000,
          frequency: "WEEKLY",
          memberships: [
            { id: "mem-1", payoutPosition: 1, status: "ACTIVE", bufferMinor: 0 },
            { id: "mem-2", payoutPosition: 2, status: "ACTIVE", bufferMinor: 0 },
          ],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      cycle: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "cycle-2" }),
        update: vi.fn().mockResolvedValue({}),
      },
      contribution: { create: vi.fn().mockResolvedValue({}) },
      membership: { update: vi.fn().mockResolvedValue({}) },
    };

    await advanceRotation(mockTx as unknown as Prisma.TransactionClient, "circle-1", { sequence: 1 });

    expect(mockTx.contribution.create).not.toHaveBeenCalled();
    expect(mockTx.membership.update).not.toHaveBeenCalled();
    expect(mockTx.cycle.update).not.toHaveBeenCalled();
  });

  it("returns early if cycle already exists for idempotency", async () => {
    const mockTx = {
      circle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "circle-1",
          totalSlots: 5,
          contributionMinor: 10000,
          frequency: "WEEKLY",
          memberships: [
            { id: "mem-1", payoutPosition: 1, status: "ACTIVE" },
            { id: "mem-2", payoutPosition: 2, status: "ACTIVE" },
          ],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      cycle: {
        findUnique: vi.fn().mockResolvedValue({ id: "existing-cycle" }),
        create: vi.fn().mockResolvedValue({}),
      },
    };

    await advanceRotation(mockTx as unknown as Prisma.TransactionClient, "circle-1", { sequence: 1 });

    expect(mockTx.cycle.create).not.toHaveBeenCalled();
    expect(mockTx.circle.update).not.toHaveBeenCalled();
  });
});

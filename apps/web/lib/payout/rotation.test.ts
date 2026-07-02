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

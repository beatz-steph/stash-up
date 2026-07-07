import { describe, it, expect, vi, beforeEach } from "vitest";
import { initiatePayout } from "./initiate";
import { prisma } from "@workspace/db";
import { acquirePayoutLock, releasePayoutLock } from "@/lib/redis";
import { initiateSubAccountBankTransfer } from "@/lib/nomba-client";

vi.mock("@/lib/redis", () => ({
  acquirePayoutLock: vi.fn(),
  releasePayoutLock: vi.fn(),
}));
vi.mock("@/lib/nomba-client", () => ({
  initiateSubAccountBankTransfer: vi.fn(),
}));
vi.mock("@workspace/db", () => {
  return {
    prisma: {
      cycle: { findUnique: vi.fn(), update: vi.fn() },
      withdrawalAccount: { findUnique: vi.fn() },
      payout: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
      nombaConfig: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb) => cb(prisma)),
    },
  };
});

const readyCycle = {
  id: "cy-1",
  status: "READY_TO_PAYOUT",
  sequence: 1,
  potExpectedMinor: 1000000, // ₦10,000 in kobo
  recipientMembershipId: "mem-1",
  recipientMembership: { id: "mem-1", userId: "user-1" },
  circle: { name: "Test Circle" },
};

const withdrawalAccount = {
  userId: "user-1",
  accountNumber: "0123456789",
  accountName: "Jane Doe",
  bankCode: "058",
  bankName: "GTBank",
};

describe("initiatePayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquirePayoutLock).mockResolvedValue(true);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue(readyCycle as never);
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue(
      withdrawalAccount as never,
    );
    vi.mocked(prisma.payout.create).mockResolvedValue({} as never);
    vi.mocked(prisma.payout.findUnique).mockResolvedValue({
      status: "INITIATED",
    } as never);
    vi.mocked(initiateSubAccountBankTransfer).mockResolvedValue({
      id: "transfer-1",
      status: "SUCCESS",
    });
    vi.mocked(prisma.nombaConfig.findFirst).mockResolvedValue(null);
  });

  it("refuses when the lock cannot be acquired (no Nomba call, no DB writes)", async () => {
    vi.mocked(acquirePayoutLock).mockResolvedValue(false);

    await expect(initiatePayout("cy-1")).rejects.toThrow("Could not acquire payout lock");
    expect(prisma.payout.create).not.toHaveBeenCalled();
    expect(initiateSubAccountBankTransfer).not.toHaveBeenCalled();
    // Lock was never held, so it must not be released
    expect(releasePayoutLock).not.toHaveBeenCalled();
  });

  it("refuses when the cycle is not READY_TO_PAYOUT and always releases the lock", async () => {
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      ...readyCycle,
      status: "PAYOUT_INITIATED",
    } as never);

    await expect(initiatePayout("cy-1")).rejects.toThrow("Cycle is not READY_TO_PAYOUT");
    expect(prisma.payout.create).not.toHaveBeenCalled();
    expect(initiateSubAccountBankTransfer).not.toHaveBeenCalled();
    expect(releasePayoutLock).toHaveBeenCalledWith("cy-1");
  });

  it("refuses when the recipient has no withdrawal account", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue(null);

    await expect(initiatePayout("cy-1")).rejects.toThrow(
      "Recipient has no withdrawal account",
    );
    expect(prisma.payout.create).not.toHaveBeenCalled();
    expect(initiateSubAccountBankTransfer).not.toHaveBeenCalled();
  });

  it("maps P2002 on Payout.create to 'already initiated' with no Nomba call", async () => {
    vi.mocked(prisma.payout.create).mockRejectedValue({ code: "P2002" });

    await expect(initiatePayout("cy-1")).rejects.toThrow("Payout already initiated");
    expect(initiateSubAccountBankTransfer).not.toHaveBeenCalled();
    expect(releasePayoutLock).toHaveBeenCalledWith("cy-1");
  });

  it("refuses if NombaConfig.status is INVALID (but allows if absent or ACTIVE)", async () => {
    vi.mocked(prisma.nombaConfig.findFirst).mockResolvedValue({ status: "INVALID" } as never);

    await expect(initiatePayout("cy-1")).rejects.toThrow("Nomba integration is disabled");
    expect(prisma.payout.create).not.toHaveBeenCalled();
    expect(initiateSubAccountBankTransfer).not.toHaveBeenCalled();
  });

  it("happy path: surfaces the transfer fee, sends the net in naira, flips cycle, records transfer id", async () => {
    await initiatePayout("cy-1");

    // Payout row records the NET sent (pot − fee) + the surfaced fee.
    // Pot ₦10,000 (1,000,000 kobo) → flat fee ₦20 (2,000) → net 998,000.
    expect(prisma.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cycleId: "cy-1",
          amountMinor: 998000,
          feeMinor: 2000,
          merchantTxRef: "payout_cy-1",
          recipientAccountNumber: "0123456789",
          recipientBankCode: "058",
          status: "INITIATED",
        }),
      }),
    );

    // Cycle claimed before the external call
    expect(prisma.cycle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cy-1" },
        data: { status: "PAYOUT_INITIATED" },
      }),
    );

    // Nomba gets the NET in naira (997,500 kobo / 100) and the deterministic key
    expect(initiateSubAccountBankTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 9980,
        merchantTxRef: "payout_cy-1",
        accountNumber: "0123456789",
        bankCode: "058",
      }),
    );

    // Result recorded on the payout row
    expect(prisma.payout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantTxRef: "payout_cy-1" },
        data: { nombaTransferId: "transfer-1", nombaStatus: "SUCCESS" },
      }),
    );

    expect(releasePayoutLock).toHaveBeenCalledWith("cy-1");
  });

  it("on Nomba failure: marks nombaStatus UNKNOWN, keeps status INITIATED, does not revert the cycle", async () => {
    vi.mocked(initiateSubAccountBankTransfer).mockRejectedValue(
      new Error("Nomba timeout"),
    );

    await expect(initiatePayout("cy-1")).rejects.toThrow("Nomba initiation failed");

    // Ambiguous outcome: record UNKNOWN + reason, but never mark FAILED here —
    // the webhook is the source of truth.
    expect(prisma.payout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantTxRef: "payout_cy-1" },
        data: expect.objectContaining({
          nombaStatus: "UNKNOWN",
          failureReason: expect.stringContaining("Nomba timeout"),
        }),
      }),
    );
    const updateData = vi.mocked(prisma.payout.update).mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(updateData.status).toBeUndefined();

    // Cycle must NOT be reverted to READY_TO_PAYOUT (would allow a re-send)
    expect(prisma.cycle.update).toHaveBeenCalledTimes(1);
    expect(prisma.cycle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PAYOUT_INITIATED" } }),
    );

    expect(releasePayoutLock).toHaveBeenCalledWith("cy-1");
  });

  it("does not clobber a webhook-set SUCCESS in the result phase", async () => {
    // Simulate the payout_success webhook landing between the Nomba call and the result tx
    vi.mocked(prisma.payout.findUnique).mockResolvedValue({
      status: "SUCCESS",
    } as never);

    await initiatePayout("cy-1");

    // Result phase reads status !== INITIATED and skips the update
    expect(prisma.payout.update).not.toHaveBeenCalled();
  });
});

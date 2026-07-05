import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isWalletWithdrawalRef,
  handleWalletWithdrawalSuccess,
  handleWalletWithdrawalFailed,
} from "./wallet-withdrawal";
import { prisma } from "@workspace/db";
import { creditWallet } from "@/lib/wallet/ledger";
import { createNotification } from "@/lib/notifications";

vi.mock("@/lib/wallet/ledger", () => ({ creditWallet: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

const tx = {
  walletWithdrawal: { findUnique: vi.fn(), update: vi.fn() },
};
vi.mock("@workspace/db", () => ({
  Prisma: {},
  prisma: { $transaction: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
    (fn as (t: typeof tx) => unknown)(tx)
  );
  tx.walletWithdrawal.update.mockResolvedValue({});
  vi.mocked(creditWallet).mockResolvedValue({ applied: true, balanceAfterMinor: 0 });
});

describe("isWalletWithdrawalRef", () => {
  it("matches our walletwd_ prefix only", () => {
    expect(isWalletWithdrawalRef("walletwd_abc")).toBe(true);
    expect(isWalletWithdrawalRef("payout_cyc1")).toBe(false);
    expect(isWalletWithdrawalRef(null)).toBe(false);
    expect(isWalletWithdrawalRef(undefined)).toBe(false);
  });
});

describe("handleWalletWithdrawalSuccess", () => {
  it("marks SUCCESS and notifies; no wallet movement", async () => {
    tx.walletWithdrawal.findUnique.mockResolvedValue({
      id: "wd1",
      status: "INITIATED",
      amountMinor: 500_000,
      nombaTransferId: null,
      wallet: { userId: "u1" },
    });
    await handleWalletWithdrawalSuccess("walletwd_1", "nomba-tx-9");
    expect(tx.walletWithdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wd1" },
        data: { status: "SUCCESS", nombaTransferId: "nomba-tx-9" },
      })
    );
    expect(creditWallet).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", title: "Withdrawal sent" })
    );
  });

  it("is idempotent — already SUCCESS is a no-op", async () => {
    tx.walletWithdrawal.findUnique.mockResolvedValue({
      id: "wd1",
      status: "SUCCESS",
      amountMinor: 500_000,
      wallet: { userId: "u1" },
    });
    await handleWalletWithdrawalSuccess("walletwd_1");
    expect(tx.walletWithdrawal.update).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("no-ops on an unknown ref", async () => {
    tx.walletWithdrawal.findUnique.mockResolvedValue(null);
    await handleWalletWithdrawalSuccess("walletwd_missing");
    expect(tx.walletWithdrawal.update).not.toHaveBeenCalled();
  });
});

describe("handleWalletWithdrawalFailed", () => {
  it("marks FAILED and reverses amount + fee back to the wallet", async () => {
    tx.walletWithdrawal.findUnique.mockResolvedValue({
      id: "wd2",
      status: "INITIATED",
      amountMinor: 500_000,
      feeMinor: 2_500,
      wallet: { userId: "u1" },
    });
    await handleWalletWithdrawalFailed("walletwd_2", "insufficient_funds");
    expect(tx.walletWithdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wd2" },
        data: { status: "FAILED", failureReason: "insufficient_funds" },
      })
    );
    expect(creditWallet).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: "u1",
        amountMinor: 502_500, // amount + fee
        source: "REVERSAL",
        idempotencyKey: "rev_wd2",
      })
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", title: "Withdrawal failed" })
    );
  });

  it("is idempotent — already FAILED does not double-reverse", async () => {
    tx.walletWithdrawal.findUnique.mockResolvedValue({
      id: "wd2",
      status: "FAILED",
      amountMinor: 500_000,
      feeMinor: 2_500,
      wallet: { userId: "u1" },
    });
    await handleWalletWithdrawalFailed("walletwd_2", "insufficient_funds");
    expect(tx.walletWithdrawal.update).not.toHaveBeenCalled();
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

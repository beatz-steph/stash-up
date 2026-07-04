import { describe, it, expect, vi, beforeEach } from "vitest";
import { creditWallet, debitWallet, WalletInsufficientFundsError } from "./ledger";
import type { Prisma } from "@workspace/db";

// Minimal tx double — only the members the ledger touches.
function makeTx(balance = 100_000) {
  const tx = {
    walletAccount: { upsert: vi.fn().mockResolvedValue({ id: "w1", balanceMinor: balance }) },
    walletLedgerEntry: { create: vi.fn().mockResolvedValue({ id: "e1" }), update: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return tx as unknown as Prisma.TransactionClient & typeof tx;
}

const base = {
  userId: "u1",
  source: "TOPUP_BANK" as const,
  idempotencyKey: "topup_x",
};

describe("creditWallet", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => {
    tx = makeTx(100_000);
    tx.$queryRaw.mockResolvedValue([{ balanceMinor: 150_000 }]);
  });

  it("credits and records the balance after", async () => {
    const res = await creditWallet(tx, { ...base, amountMinor: 50_000 });
    expect(res).toEqual({ applied: true, balanceAfterMinor: 150_000 });
    expect(tx.walletLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: "CREDIT", amountMinor: 50_000, idempotencyKey: "topup_x" }),
      })
    );
    expect(tx.walletLedgerEntry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { balanceAfterMinor: 150_000 },
    });
  });

  it("is a no-op on a replayed idempotency key (never double-posts)", async () => {
    tx.walletLedgerEntry.create.mockRejectedValueOnce({ code: "P2002" });
    const res = await creditWallet(tx, { ...base, amountMinor: 50_000 });
    expect(res).toEqual({ applied: false, balanceAfterMinor: 100_000 });
    expect(tx.$queryRaw).not.toHaveBeenCalled(); // balance untouched
  });

  it("rejects a non-positive amount", async () => {
    await expect(creditWallet(tx, { ...base, amountMinor: 0 })).rejects.toThrow();
    await expect(creditWallet(tx, { ...base, amountMinor: -1 })).rejects.toThrow();
  });
});

describe("debitWallet", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => {
    tx = makeTx(100_000);
  });

  it("debits when funds cover it", async () => {
    tx.$queryRaw.mockResolvedValue([{ balanceMinor: 40_000 }]);
    const res = await debitWallet(tx, { ...base, source: "WITHDRAWAL", amountMinor: 60_000 });
    expect(res).toEqual({ applied: true, balanceAfterMinor: 40_000 });
  });

  it("throws WalletInsufficientFundsError when the guarded update matches no row", async () => {
    tx.$queryRaw.mockResolvedValue([]); // guard: balance < amount
    await expect(
      debitWallet(tx, { ...base, source: "WITHDRAWAL", amountMinor: 999_999 })
    ).rejects.toBeInstanceOf(WalletInsufficientFundsError);
  });

  it("is a no-op on a replayed idempotency key", async () => {
    tx.walletLedgerEntry.create.mockRejectedValueOnce({ code: "P2002" });
    const res = await debitWallet(tx, { ...base, source: "WITHDRAWAL", amountMinor: 60_000 });
    expect(res.applied).toBe(false);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});

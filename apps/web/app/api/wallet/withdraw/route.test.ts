import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { getSession } from "@/lib/session";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { initiateSubAccountBankTransfer } from "@/lib/nomba-client";
import { verifyWalletPin } from "@/lib/wallet/pin";
import { ensureWallet, debitWallet, WalletInsufficientFundsError } from "@/lib/wallet/ledger";
import { prisma } from "@workspace/db";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));
vi.mock("@/lib/nomba-client", () => ({ initiateSubAccountBankTransfer: vi.fn() }));
vi.mock("@/lib/wallet/pin", () => ({ verifyWalletPin: vi.fn() }));
vi.mock("@/lib/wallet/ledger", () => {
  class WalletInsufficientFundsError extends Error {}
  return { WalletInsufficientFundsError, ensureWallet: vi.fn(), debitWallet: vi.fn() };
});

const tx = { walletWithdrawal: { create: vi.fn() } };
vi.mock("@workspace/db", () => ({
  Prisma: {},
  prisma: {
    $transaction: vi.fn(),
    withdrawalAccount: { findUnique: vi.fn() },
    walletWithdrawal: { update: vi.fn() },
  },
}));

function req(body: unknown) {
  return new NextRequest("http://localhost/api/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const ACCOUNT = {
  bankCode: "058",
  bankName: "GTBank",
  accountNumber: "0123456789",
  accountName: "Test User",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
  vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(false);
  vi.mocked(verifyWalletPin).mockResolvedValue({ ok: true });
  vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue(ACCOUNT as never);
  vi.mocked(prisma.walletWithdrawal.update).mockResolvedValue({} as never);
  vi.mocked(initiateSubAccountBankTransfer).mockResolvedValue({ id: "nomba-1" } as never);
  vi.mocked(ensureWallet).mockResolvedValue({ id: "w1", balanceMinor: 1_000_000 } as never);
  vi.mocked(debitWallet).mockResolvedValue({ applied: true, balanceAfterMinor: 0 });
  tx.walletWithdrawal.create.mockResolvedValue({ id: "wd1" });
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
    (fn as (t: typeof tx) => unknown)(tx)
  );
});

describe("POST /api/wallet/withdraw", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(req({ amountMinor: 100_000, pin: "1234" }))).status).toBe(401);
  });

  it("returns 422 on a missing/invalid body", async () => {
    expect((await POST(req({ amountMinor: 0, pin: "1234" }))).status).toBe(422);
    expect((await POST(req({ amountMinor: 100_000 }))).status).toBe(422);
  });

  it("returns 503 when Nomba is disabled", async () => {
    vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(true);
    expect((await POST(req({ amountMinor: 100_000, pin: "1234" }))).status).toBe(503);
  });

  it("returns 409 when no PIN is set", async () => {
    vi.mocked(verifyWalletPin).mockResolvedValue({ ok: false, reason: "no_pin" });
    expect((await POST(req({ amountMinor: 100_000, pin: "1234" }))).status).toBe(409);
  });

  it("returns 423 when the PIN is locked", async () => {
    vi.mocked(verifyWalletPin).mockResolvedValue({ ok: false, reason: "locked" });
    expect((await POST(req({ amountMinor: 100_000, pin: "1234" }))).status).toBe(423);
  });

  it("returns 403 on a wrong PIN", async () => {
    vi.mocked(verifyWalletPin).mockResolvedValue({ ok: false, reason: "mismatch", retriesLeft: 3 });
    expect((await POST(req({ amountMinor: 100_000, pin: "0000" }))).status).toBe(403);
  });

  it("returns 400 without a linked withdrawal account", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue(null);
    expect((await POST(req({ amountMinor: 100_000, pin: "1234" }))).status).toBe(400);
  });

  it("returns 400 when the wallet can't cover amount + fee", async () => {
    vi.mocked(debitWallet).mockRejectedValue(new WalletInsufficientFundsError());
    const res = await POST(req({ amountMinor: 100_000, pin: "1234" }));
    expect(res.status).toBe(400);
    expect(initiateSubAccountBankTransfer).not.toHaveBeenCalled();
  });

  it("debits amount + fee, sends the transfer, and surfaces the fee", async () => {
    const res = await POST(req({ amountMinor: 100_000, pin: "1234" })); // ₦1,000
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.feeMinor).toBe(2_000); // ₦20 flat transfer fee
    expect(data.amountMinor).toBe(100_000);
    expect(data.status).toBe("INITIATED");

    // Wallet debited the total (amount + fee) under the WITHDRAWAL source.
    expect(debitWallet).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: "u1",
        amountMinor: 102_000,
        source: "WITHDRAWAL",
        idempotencyKey: "wd_wd1",
      })
    );

    // Nomba receives naira (amount only) + our unique idempotency ref.
    const transferArg = vi.mocked(initiateSubAccountBankTransfer).mock.calls[0]![0];
    expect(transferArg.amount).toBe(1_000);
    expect(transferArg.merchantTxRef).toMatch(/^walletwd_/);

    // nombaTransferId recorded on success.
    expect(prisma.walletWithdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nombaTransferId: "nomba-1" }) })
    );
  });

  it("does NOT reverse when the Nomba call throws (webhook finalizes)", async () => {
    vi.mocked(initiateSubAccountBankTransfer).mockRejectedValue(new Error("network"));
    const res = await POST(req({ amountMinor: 100_000, pin: "1234" }));
    expect(res.status).toBe(200); // debit stands; left INITIATED for the webhook
    expect(prisma.walletWithdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failureReason: "nomba_initiation_unknown" } })
    );
  });
});

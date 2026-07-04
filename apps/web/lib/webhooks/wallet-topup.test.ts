import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleWalletBankTopup, handleWalletCardTopup } from "./wallet-topup";
import { prisma } from "@workspace/db";
import { creditWallet } from "@/lib/wallet/ledger";
import type { NombaWebhookPayload } from "./verify";
import type { WebhookReceipt, VirtualAccount } from "@workspace/db";

vi.mock("@/lib/wallet/ledger", () => ({ creditWallet: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

const tx = { inboundTransfer: { create: vi.fn() } };
vi.mock("@workspace/db", () => ({
  Prisma: {},
  prisma: { $transaction: vi.fn() },
}));

const receipt = { id: "r1", providerEventId: "evt1" } as WebhookReceipt;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
    (fn as (t: typeof tx) => unknown)(tx)
  );
  tx.inboundTransfer.create.mockResolvedValue({ id: "in1" });
  vi.mocked(creditWallet).mockResolvedValue({ applied: true, balanceAfterMinor: 0 });
});

describe("handleWalletBankTopup", () => {
  const va = {
    id: "va1",
    userId: "u1",
    accountRef: "wallet_u1",
    kind: "WALLET",
  } as unknown as VirtualAccount;

  function payload(amount: number): NombaWebhookPayload {
    return {
      event_type: "payment_success",
      requestId: "evt1",
      data: {
        transaction: { type: "vact_transfer", transactionId: "TX1", transactionAmount: amount },
      },
    } as NombaWebhookPayload;
  }

  it("records a WALLET_TOPUP inbound transfer and credits the wallet", async () => {
    await handleWalletBankTopup(receipt, payload(5000), va); // ₦5,000
    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "WALLET_TOPUP", amountMinor: 500_000, virtualAccountId: "va1" }),
      })
    );
    expect(creditWallet).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: "u1", amountMinor: 500_000, source: "TOPUP_BANK", idempotencyKey: "topup_in1" })
    );
  });

  it("does not double-credit on a duplicate webhook (P2002)", async () => {
    tx.inboundTransfer.create.mockRejectedValueOnce({ code: "P2002" });
    await handleWalletBankTopup(receipt, payload(5000), va);
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

describe("handleWalletCardTopup", () => {
  function payload(amount: number, fee: number, userId = "u1"): NombaWebhookPayload {
    return {
      event_type: "payment_success",
      requestId: "evt1",
      data: {
        transaction: {
          type: "online_checkout",
          transactionId: "TXC",
          transactionAmount: amount,
          fee,
        },
        order: {
          orderReference: `wallettopup_${userId}_x`,
          orderMetaData: { kind: "wallettopup", userId },
          currency: "NGN",
        },
      },
    } as NombaWebhookPayload;
  }

  it("credits the NET (amount − fee) and records the fee", async () => {
    await handleWalletCardTopup(receipt, payload(10_000, 140)); // ₦10,000 gross, ₦140 fee
    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "WALLET_TOPUP", amountMinor: 986_000, feeMinor: 14_000 }),
      })
    );
    expect(creditWallet).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amountMinor: 986_000, source: "TOPUP_CARD" })
    );
  });

  it("skips the discovery placeholder userId", async () => {
    await handleWalletCardTopup(receipt, payload(10_000, 140, "disco"));
    expect(tx.inboundTransfer.create).not.toHaveBeenCalled();
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleWalletBankTopup,
  handleWalletCardTopup,
  settleWalletTopupFromVerify,
} from "./wallet-topup";
import { prisma } from "@workspace/db";
import { creditWallet } from "@/lib/wallet/ledger";
import type { NombaWebhookPayload } from "./verify";
import type { WebhookReceipt, VirtualAccount } from "@workspace/db";

vi.mock("@/lib/wallet/ledger", () => ({ creditWallet: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

const tx = {
  inboundTransfer: { create: vi.fn() },
  savedCard: { findFirst: vi.fn(), create: vi.fn() },
  chargeAttempt: { update: vi.fn() },
};
vi.mock("@workspace/db", () => ({
  Prisma: {},
  prisma: { $transaction: vi.fn(), chargeAttempt: { findUnique: vi.fn() } },
}));

const receipt = { id: "r1", providerEventId: "evt1" } as WebhookReceipt;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
    (fn as (t: typeof tx) => unknown)(tx)
  );
  tx.inboundTransfer.create.mockResolvedValue({ id: "in1" });
  vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue(null); // new-card default
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

  function tokenizedPayload(): NombaWebhookPayload {
    const p = payload(10_000, 140);
    p.data!.tokenizedCardData = { tokenKey: "TK_NEW", cardType: "Visa" };
    p.data!.order!.cardLast4Digits = "4242";
    return p;
  }

  it("saves the tokenized card for future one-tap top-ups", async () => {
    tx.savedCard.findFirst.mockResolvedValue(null);
    await handleWalletCardTopup(receipt, tokenizedPayload());
    expect(tx.savedCard.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        tokenKey: "TK_NEW",
        last4: "4242",
        cardType: "Visa",
        status: "ACTIVE",
      }),
    });
  });

  it("does not duplicate an already-saved card (same tokenKey)", async () => {
    tx.savedCard.findFirst.mockResolvedValue({ id: "card-existing" });
    await handleWalletCardTopup(receipt, tokenizedPayload());
    expect(tx.savedCard.create).not.toHaveBeenCalled();
    // The wallet credit still happens — only the card save is skipped.
    expect(creditWallet).toHaveBeenCalled();
  });

  it("does not touch saved cards for a non-tokenized settlement", async () => {
    await handleWalletCardTopup(receipt, payload(10_000, 140));
    expect(tx.savedCard.findFirst).not.toHaveBeenCalled();
    expect(tx.savedCard.create).not.toHaveBeenCalled();
  });

  it("keys on the durable attempt and marks it SUCCESS for a saved-card top-up", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({ id: "att9", status: "PENDING" } as never);
    await handleWalletCardTopup(receipt, payload(10_000, 140));
    // InboundTransfer keyed on the attempt (not the webhook event id) so the
    // sweep and this webhook converge idempotently.
    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerEventId: "topup_att9" }) })
    );
    expect(tx.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "att9" }, data: expect.objectContaining({ status: "SUCCESS" }) })
    );
  });

  it("no-ops if the durable attempt was already reconciled", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({ id: "att9", status: "SUCCESS" } as never);
    await handleWalletCardTopup(receipt, payload(10_000, 140));
    expect(tx.inboundTransfer.create).not.toHaveBeenCalled();
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

describe("settleWalletTopupFromVerify (missed-webhook backstop)", () => {
  it("credits the NET using Nomba's reported fee/amount", async () => {
    await settleWalletTopupFromVerify(
      { id: "att9", userId: "u1", amountMinor: 1_014_000 },
      { transactionId: "TXV", feeMinor: 14_000, grossMinor: 1_014_000 }
    );
    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerEventId: "topup_att9", amountMinor: 1_000_000, feeMinor: 14_000 }),
      })
    );
    expect(creditWallet).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: "u1", amountMinor: 1_000_000, source: "TOPUP_CARD" })
    );
    expect(tx.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "att9" }, data: expect.objectContaining({ status: "SUCCESS" }) })
    );
  });

  it("estimates the fee from the grossed charge when Nomba omits it", async () => {
    // grossMinor falls back to attempt.amountMinor; fee ≈ 1.4% of gross.
    await settleWalletTopupFromVerify(
      { id: "att9", userId: "u1", amountMinor: 1_014_000 },
      { transactionId: "TXV", feeMinor: null, grossMinor: null }
    );
    const arg = vi.mocked(creditWallet).mock.calls[0]![1];
    // net = gross − round(gross * (1 − 0.014)) complement = round(gross * 0.014-ish)
    expect(arg.amountMinor).toBe(1_014_000 - (1_014_000 - Math.round(1_014_000 * (1 - 0.014))));
    expect(arg.source).toBe("TOPUP_CARD");
  });
});

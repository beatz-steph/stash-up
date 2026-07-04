import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isCardSettlement,
  handleCardSettlement,
} from "./card-settlement";
import { prisma } from "@workspace/db";
import { refundCheckoutTransaction } from "@/lib/nomba-client";
import type { NombaWebhookPayload } from "./verify";
import type { WebhookReceipt } from "@workspace/db";

vi.mock("@/lib/nomba-client", () => ({ refundCheckoutTransaction: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

// tx mock shared across $transaction invocations
const tx = {
  savedCard: { create: vi.fn() },
  membership: { update: vi.fn() },
  chargeAttempt: { update: vi.fn() },
  inboundTransfer: { create: vi.fn() },
  contribution: { upsert: vi.fn() },
  cycle: { update: vi.fn() },
};

vi.mock("@workspace/db", () => ({
  Prisma: {},
  prisma: {
    chargeAttempt: { findUnique: vi.fn(), update: vi.fn() },
    membership: { findUnique: vi.fn() },
    circle: { findUnique: vi.fn() },
    cycle: { findUnique: vi.fn() },
    contribution: { findUnique: vi.fn() },
    savedCard: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const receipt = { id: "r1", providerEventId: "evt1" } as WebhookReceipt;

function verifyPayload(over: Partial<Record<string, unknown>> = {}): NombaWebhookPayload {
  return {
    event_type: "payment_success",
    requestId: "evt1",
    data: {
      tokenizedCardData: { tokenKey: "TK123", cardType: "Verve" },
      transaction: {
        type: "online_checkout",
        transactionId: "TX1",
        transactionAmount: 50,
        time: "2026-07-04T14:44:47Z",
      },
      order: {
        orderReference: "cardverify_u1_n1",
        orderMetaData: { kind: "cardverify", userId: "u1", attemptId: "att1" },
        cardLast4Digits: "5417",
        amount: 50,
        currency: "NGN",
      },
    },
    ...over,
  } as NombaWebhookPayload;
}

function enrollPayload(kind: "cardenroll" | "cardchg"): NombaWebhookPayload {
  return {
    event_type: "payment_success",
    requestId: "evt1",
    data: {
      tokenizedCardData: { tokenKey: "TK999", cardType: "Visa" },
      transaction: {
        type: "online_checkout",
        transactionId: "TX9",
        transactionAmount: 10000, // ₦10,000
        time: "2026-07-04T14:44:47Z",
      },
      order: {
        orderReference: `${kind}_cyc1_m1_x`,
        orderMetaData: { kind, userId: "u1", membershipId: "m1", cycleId: "cyc1", attemptId: "att2" },
        cardLast4Digits: "4242",
        amount: 10000,
        currency: "NGN",
      },
    },
  } as NombaWebhookPayload;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
    (fn as (t: typeof tx) => unknown)(tx)
  );
  tx.savedCard.create.mockResolvedValue({ id: "card1" });
  tx.cycle.update.mockResolvedValue({
    id: "cyc1",
    potCollectedMinor: 1_000_000,
    potExpectedMinor: 1_000_000,
    status: "OPEN",
  });
  vi.mocked(refundCheckoutTransaction).mockResolvedValue({ success: true, message: "ok" });
});

describe("isCardSettlement", () => {
  it("detects online_checkout / order-bearing payloads", () => {
    expect(isCardSettlement(verifyPayload())).toBe(true);
    expect(
      isCardSettlement({
        event_type: "payment_success",
        requestId: "x",
        data: { transaction: { type: "vact_transfer", aliasAccountReference: "abc" } },
      } as NombaWebhookPayload)
    ).toBe(false);
  });
});

describe("handleCardSettlement — verification", () => {
  it("creates the card, binds the membership, marks SUCCESS, and refunds the ₦50", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "att1",
      userId: "u1",
      membershipId: "m1",
      cycleId: null,
      amountMinor: 5000,
      status: "PENDING",
      savedCardId: null,
    } as never);

    await handleCardSettlement(receipt, verifyPayload());

    expect(tx.savedCard.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", tokenKey: "TK123", last4: "5417" }) })
    );
    expect(tx.membership.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { autoDebitCardId: "card1" },
    });
    expect(tx.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCESS", refundStatus: "PENDING" }) })
    );
    expect(refundCheckoutTransaction).toHaveBeenCalledWith({ transactionId: "TX1", amountMinor: 5000 });
    expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refundStatus: "REFUNDED" }) })
    );
    // ₦50 is NEVER applied to a pot.
    expect(tx.contribution.upsert).not.toHaveBeenCalled();
  });

  it("does not bind when the attempt has no membership (Settings path)", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "att1",
      userId: "u1",
      membershipId: null,
      cycleId: null,
      amountMinor: 5000,
      status: "PENDING",
      savedCardId: null,
    } as never);

    await handleCardSettlement(receipt, verifyPayload());
    expect(tx.savedCard.create).toHaveBeenCalled();
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it("marks refundStatus FAILED when the refund call throws", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "att1",
      userId: "u1",
      membershipId: null,
      cycleId: null,
      amountMinor: 5000,
      status: "PENDING",
      savedCardId: null,
    } as never);
    vi.mocked(refundCheckoutTransaction).mockRejectedValue(new Error("nomba down"));

    await handleCardSettlement(receipt, verifyPayload());
    expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refundStatus: "FAILED" }) })
    );
  });
});

describe("handleCardSettlement — enrollment", () => {
  beforeEach(() => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "att2",
      userId: "u1",
      membershipId: "m1",
      cycleId: "cyc1",
      amountMinor: 1_000_000,
      status: "PENDING",
      savedCardId: null,
    } as never);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", circleId: "c1" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "c1",
      status: "ACTIVE",
      contributionMinor: 1_000_000,
      currentCycleSeq: 1,
    } as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      id: "cyc1",
      sequence: 1,
      status: "OPEN",
    } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue(null);
  });

  it("records a CARD inbound transfer, saves+binds the card, and applies the contribution", async () => {
    await handleCardSettlement(receipt, enrollPayload("cardenroll"));

    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "CARD", providerEventId: "card_att2", matchStatus: "MATCHED" }),
      })
    );
    expect(tx.savedCard.create).toHaveBeenCalled();
    expect(tx.membership.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { autoDebitCardId: "card1" },
    });
    expect(tx.contribution.upsert).toHaveBeenCalled();
    expect(tx.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCESS" }) })
    );
  });

  it("charge settlement applies the contribution without creating a card", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "att2",
      userId: "u1",
      membershipId: "m1",
      cycleId: "cyc1",
      amountMinor: 1_000_000,
      status: "PENDING",
      savedCardId: "existing-card",
    } as never);

    await handleCardSettlement(receipt, enrollPayload("cardchg"));
    expect(tx.savedCard.create).not.toHaveBeenCalled();
    expect(tx.contribution.upsert).toHaveBeenCalled();
  });
});

describe("handleCardSettlement — guards", () => {
  it("is a no-op when the attempt is already SUCCESS", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "att1",
      status: "SUCCESS",
    } as never);
    await handleCardSettlement(receipt, verifyPayload());
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is a no-op when no ChargeAttempt is found", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue(null);
    await handleCardSettlement(receipt, verifyPayload());
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

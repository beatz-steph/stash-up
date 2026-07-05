import { describe, it, expect, vi, beforeEach } from "vitest";
import { isCardSettlement, handleCardSettlement } from "./card-settlement";
import { prisma } from "@workspace/db";
import type { NombaWebhookPayload } from "./verify";
import type { WebhookReceipt } from "@workspace/db";

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

// tx mock shared across $transaction invocations
const tx = {
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
    $transaction: vi.fn(),
  },
}));

const receipt = { id: "r1", providerEventId: "evt1" } as WebhookReceipt;

/** A one-time card cycle payment (`cardchg`). */
function chargePayload(): NombaWebhookPayload {
  return {
    event_type: "payment_success",
    requestId: "evt1",
    data: {
      transaction: {
        type: "online_checkout",
        transactionId: "TX9",
        transactionAmount: 10000, // ₦10,000
        time: "2026-07-04T14:44:47Z",
      },
      order: {
        orderReference: "cardchg_cyc1_m1_x",
        orderMetaData: { kind: "cardchg", userId: "u1", membershipId: "m1", cycleId: "cyc1", attemptId: "att2" },
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
  tx.cycle.update.mockResolvedValue({
    id: "cyc1",
    potCollectedMinor: 1_000_000,
    potExpectedMinor: 1_000_000,
    status: "OPEN",
  });
});

describe("isCardSettlement", () => {
  it("detects online_checkout / order-bearing payloads", () => {
    expect(isCardSettlement(chargePayload())).toBe(true);
    expect(
      isCardSettlement({
        event_type: "payment_success",
        requestId: "x",
        data: { transaction: { type: "vact_transfer", aliasAccountReference: "abc" } },
      } as NombaWebhookPayload)
    ).toBe(false);
  });
});

describe("handleCardSettlement — cardchg contribution", () => {
  beforeEach(() => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "att2",
      userId: "u1",
      membershipId: "m1",
      cycleId: "cyc1",
      amountMinor: 1_000_000,
      status: "PENDING",
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

  it("records a CARD inbound transfer and applies the contribution (no card saved)", async () => {
    await handleCardSettlement(receipt, chargePayload());

    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "CARD", providerEventId: "card_att2", matchStatus: "MATCHED" }),
      })
    );
    expect(tx.contribution.upsert).toHaveBeenCalled();
    expect(tx.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCESS" }) })
    );
    // Cards are never saved — no membership binding.
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it("applies the NET (gross − fee) to the pot and records the surfaced fee", async () => {
    // Grossed-up ₦10,142 charge; Nomba takes a ₦142 fee → exactly ₦10,000 lands.
    const feeBearing = chargePayload();
    feeBearing.data!.transaction!.transactionAmount = 10142;
    (feeBearing.data!.transaction as { fee?: number }).fee = 142;

    await handleCardSettlement(receipt, feeBearing);

    // InboundTransfer records the NET applied (1,000,000) + the fee (14,200) —
    // never the gross, so the fee portion we never received can't inflate a pot.
    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountMinor: 1_000_000,
          feeMinor: 14_200,
          matchStatus: "MATCHED",
        }),
      })
    );
    expect(tx.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ feeMinor: 14_200 }) })
    );
  });
});

describe("handleCardSettlement — guards", () => {
  it("is a no-op when the attempt is already SUCCESS", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "att2",
      status: "SUCCESS",
    } as never);
    await handleCardSettlement(receipt, chargePayload());
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is a no-op when no ChargeAttempt is found", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue(null);
    await handleCardSettlement(receipt, chargePayload());
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ignores an unroutable settlement (unknown kind)", async () => {
    const unknown = chargePayload();
    unknown.data!.order!.orderReference = "mystery_1";
    unknown.data!.order!.orderMetaData = {};
    await handleCardSettlement(receipt, unknown);
    expect(prisma.chargeAttempt.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

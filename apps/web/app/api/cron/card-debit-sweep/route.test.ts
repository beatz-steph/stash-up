import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import {
  chargeTokenizedCard,
  verifyCheckoutTransaction,
  refundCheckoutTransaction,
} from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { collectFromWallet } from "@/lib/wallet/waterfall";
import { settleCardChargeFromVerify } from "@/lib/webhooks/card-settlement";
import { settleWalletTopupFromVerify } from "@/lib/webhooks/wallet-topup";
import { NextRequest } from "next/server";

vi.mock("@/lib/nomba-client", () => ({
  chargeTokenizedCard: vi.fn(),
  verifyCheckoutTransaction: vi.fn(),
  refundCheckoutTransaction: vi.fn(),
}));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));
vi.mock("@/lib/wallet/waterfall", () => ({ collectFromWallet: vi.fn() }));
vi.mock("@/lib/webhooks/card-settlement", () => ({ settleCardChargeFromVerify: vi.fn() }));
vi.mock("@/lib/webhooks/wallet-topup", () => ({ settleWalletTopupFromVerify: vi.fn() }));
vi.mock("@workspace/db", () => ({
  prisma: {
    membership: { findMany: vi.fn() },
    cycle: { findUnique: vi.fn() },
    contribution: { findUnique: vi.fn() },
    chargeAttempt: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

const SECRET = "test-secret";

function req(auth = `Bearer ${SECRET}`) {
  return new NextRequest("http://localhost/api/cron/card-debit-sweep", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

/** findMany is called for priors (attemptNumber), stale-pending (status), and
 * failed-refunds (refundStatus) — route each by its where shape. */
function routeFindMany(opts: {
  priors?: unknown[];
  stale?: unknown[];
  refunds?: unknown[];
}) {
  vi.mocked(prisma.chargeAttempt.findMany).mockImplementation((args: unknown) => {
    const where = (args as { where?: Record<string, unknown> }).where ?? {};
    if (where.attemptNumber) return Promise.resolve(opts.priors ?? []) as never;
    if (where.status === "PENDING") return Promise.resolve(opts.stale ?? []) as never;
    if (where.refundStatus === "FAILED") return Promise.resolve(opts.refunds ?? []) as never;
    return Promise.resolve([]) as never;
  });
}

const memberWithBoundCard = {
  id: "m1",
  circleId: "c1",
  autoDebitCard: { id: "card1", tokenKey: "TK", status: "ACTIVE" },
  circle: { id: "c1", status: "ACTIVE", contributionMinor: 1_000_000, currentCycleSeq: 1 },
  user: { id: "u1", email: "u@e.com" },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(false);
  vi.mocked(prisma.membership.findMany).mockResolvedValue([] as never);
  routeFindMany({});
  vi.mocked(prisma.chargeAttempt.create).mockResolvedValue({ id: "att1" } as never);
  vi.mocked(chargeTokenizedCard).mockResolvedValue({ status: true, message: "Approved", otpRequired: false, orderId: null, orderReference: "ref" });
  vi.mocked(collectFromWallet).mockResolvedValue({ debitedMinor: 0, remainingDueMinor: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/cron/card-debit-sweep — auth", () => {
  it("401 without the CRON secret", async () => {
    const res = await POST(req(""));
    expect(res.status).toBe(401);
  });
});

describe("waterfall — wallet first, card for the remainder", () => {
  it("drains the wallet then charges the card for what's left", async () => {
    const member = {
      ...memberWithBoundCard,
      autoDebitWallet: true,
    };
    vi.mocked(prisma.membership.findMany).mockResolvedValue([member] as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cyc1", status: "COLLECTING" } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 0 } as never);
    // Wallet covers ₦4,000 of the ₦10,000; ₦6,000 remains for the card.
    vi.mocked(collectFromWallet).mockResolvedValue({ debitedMinor: 400_000, remainingDueMinor: 600_000 });

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.walletCollected).toBe(1);
    expect(data.charged).toBe(1);
    const chargeArg = vi.mocked(chargeTokenizedCard).mock.calls[0]![0];
    // Only the remainder, grossed up for the card fee: ceil(600000 / (1 − 0.014)).
    expect(chargeArg.amountMinor).toBe(608_520);
  });

  it("wallet covers the whole contribution → no card charge", async () => {
    const member = { ...memberWithBoundCard, autoDebitWallet: true };
    vi.mocked(prisma.membership.findMany).mockResolvedValue([member] as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cyc1", status: "COLLECTING" } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 0 } as never);
    vi.mocked(collectFromWallet).mockResolvedValue({ debitedMinor: 1_000_000, remainingDueMinor: 0 });

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.walletCollected).toBe(1);
    expect(chargeTokenizedCard).not.toHaveBeenCalled();
  });
});

describe("charge sweep — THE CORE RULE", () => {
  it("partial transfer: charges exactly the remaining ₦4,000 of ₦10,000", async () => {
    vi.mocked(prisma.membership.findMany).mockResolvedValue([memberWithBoundCard] as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cyc1", status: "COLLECTING" } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 600_000 } as never);

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.charged).toBe(1);

    const createArg = vi.mocked(prisma.chargeAttempt.create).mock.calls[0]![0];
    // ₦4,000 owed, grossed up for the card fee: ceil(400000 / (1 − 0.014)).
    expect(createArg.data.amountMinor).toBe(405_680);
    expect(createArg.data.attemptNumber).toBe(1);
    const chargeArg = vi.mocked(chargeTokenizedCard).mock.calls[0]![0];
    expect(chargeArg.amountMinor).toBe(405_680);
    expect(chargeArg.tokenKey).toBe("TK");
  });

  it("fully paid by transfer: creates NOTHING even after a prior failed attempt", async () => {
    vi.mocked(prisma.membership.findMany).mockResolvedValue([memberWithBoundCard] as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cyc1", status: "COLLECTING" } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 1_000_000 } as never);
    routeFindMany({
      priors: [{ attemptNumber: 1, status: "FAILED", createdAt: new Date(0) }],
    });

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.charged).toBe(0);
    expect(data.chargeSkipped).toBe(1);
    expect(prisma.chargeAttempt.create).not.toHaveBeenCalled();
    expect(chargeTokenizedCard).not.toHaveBeenCalled();
  });

  it("does not charge while a PENDING attempt is in flight", async () => {
    vi.mocked(prisma.membership.findMany).mockResolvedValue([memberWithBoundCard] as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cyc1", status: "OPEN" } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 0 } as never);
    routeFindMany({
      priors: [{ attemptNumber: 1, status: "PENDING", createdAt: new Date() }],
    });

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.charged).toBe(0);
    expect(chargeTokenizedCard).not.toHaveBeenCalled();
  });

  it("marks the attempt FAILED when the charge call throws (sweep continues)", async () => {
    vi.mocked(prisma.membership.findMany).mockResolvedValue([memberWithBoundCard] as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cyc1", status: "OPEN" } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue(null);
    vi.mocked(chargeTokenizedCard).mockRejectedValue(new Error("nomba down"));

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.chargeFailed).toBe(1);
    expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("skips a non-collectible cycle (READY_TO_PAYOUT)", async () => {
    vi.mocked(prisma.membership.findMany).mockResolvedValue([memberWithBoundCard] as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ id: "cyc1", status: "READY_TO_PAYOUT" } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 0 } as never);

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.chargeSkipped).toBe(1);
    expect(chargeTokenizedCard).not.toHaveBeenCalled();
  });
});

describe("verify backstop", () => {
  it("marks a stale PENDING attempt FAILED when Nomba reports non-success", async () => {
    routeFindMany({
      stale: [{ id: "att-stale", orderReference: "cardchg_x", purpose: "CONTRIBUTION" }],
    });
    vi.mocked(verifyCheckoutTransaction).mockResolvedValue({
      settled: false,
      status: "FAILED",
      transactionId: null,
      feeMinor: null,
      amountMinor: null,
    });

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.verifyFailed).toBe(1);
    expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("APPLIES a settled saved-card contribution (webhook was missed)", async () => {
    routeFindMany({
      stale: [
        {
          id: "att-stale",
          orderReference: "cardchg_x",
          purpose: "CONTRIBUTION",
          cycleId: "cyc1",
          membershipId: "m1",
          amountMinor: 405_680,
        },
      ],
    });
    vi.mocked(verifyCheckoutTransaction).mockResolvedValue({
      settled: true,
      status: "SUCCESS",
      transactionId: "TXVERIFY",
      feeMinor: 5_680,
      amountMinor: 405_680,
    });

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.verifyCaptured).toBe(1);
    expect(settleCardChargeFromVerify).toHaveBeenCalledWith(
      expect.objectContaining({ id: "att-stale" }),
      { transactionId: "TXVERIFY", feeMinor: 5_680, grossMinor: 405_680 }
    );
  });

  it("APPLIES a settled saved-card wallet top-up (webhook was missed)", async () => {
    routeFindMany({
      stale: [
        { id: "att-topup", orderReference: "wallettopup_x", purpose: "TOPUP", amountMinor: 507_100 },
      ],
    });
    vi.mocked(verifyCheckoutTransaction).mockResolvedValue({
      settled: true,
      status: "SUCCESS",
      transactionId: "TXTOP",
      feeMinor: 7_100,
      amountMinor: 507_100,
    });

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.verifyCaptured).toBe(1);
    expect(settleWalletTopupFromVerify).toHaveBeenCalledWith(
      expect.objectContaining({ id: "att-topup" }),
      { transactionId: "TXTOP", feeMinor: 7_100, grossMinor: 507_100 }
    );
  });

  it("only captures the txn id for an ENROLLMENT (needs the webhook's tokenKey)", async () => {
    routeFindMany({
      stale: [{ id: "att-enroll", orderReference: "cardenroll_x", purpose: "ENROLLMENT" }],
    });
    vi.mocked(verifyCheckoutTransaction).mockResolvedValue({
      settled: true,
      status: "SUCCESS",
      transactionId: "TXVERIFY",
      feeMinor: null,
      amountMinor: null,
    });

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.verifyCaptured).toBe(1);
    expect(settleCardChargeFromVerify).not.toHaveBeenCalled();
    expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nombaTransactionId: "TXVERIFY" } })
    );
  });
});

describe("refund retry", () => {
  it("retries a FAILED refund and marks it REFUNDED on success", async () => {
    routeFindMany({
      refunds: [{ id: "att-r", nombaTransactionId: "TX1", amountMinor: 5000, refundRetryCount: 0 }],
    });
    vi.mocked(refundCheckoutTransaction).mockResolvedValue({ success: true, message: "ok" });

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.refundsRetried).toBe(1);
    expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refundStatus: "REFUNDED" }) })
    );
  });

  it("increments the counter and flags exhaustion at MAX_REFUND_RETRIES", async () => {
    routeFindMany({
      refunds: [{ id: "att-r", nombaTransactionId: "TX1", amountMinor: 5000, refundRetryCount: 2 }],
    });
    vi.mocked(refundCheckoutTransaction).mockRejectedValue(new Error("refund failed"));

    const res = await POST(req());
    const { data } = await res.json();
    expect(data.refundsExhausted).toBe(1);
    expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { refundRetryCount: 3 } })
    );
  });
});

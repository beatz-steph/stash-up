import { vi, describe, it, expect, beforeEach } from "vitest";
import type {
  WebhookReceipt,
  VirtualAccount,
  Membership,
  Cycle,
  InboundTransfer,
} from "@workspace/db";
import { dispatchWebhookEvent } from "./dispatch";
import { prisma } from "@workspace/db";
import { matchInboundTransfer, type MatchResult } from "../reconciliation/match";
import type { NombaWebhookPayload } from "./verify";

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      virtualAccount: { findUnique: vi.fn() },
      membership: { findUnique: vi.fn(), update: vi.fn() },
      circle: { findUnique: vi.fn() },
      cycle: { findUnique: vi.fn(), update: vi.fn() },
      contribution: { findUnique: vi.fn(), upsert: vi.fn() },
      webhookReceipt: { update: vi.fn() },
      inboundTransfer: { create: vi.fn() },
      $transaction: vi.fn(async (cb) => {
        return cb(prisma);
      }),
    },
  };
});

vi.mock("../reconciliation/match", () => ({
  matchInboundTransfer: vi.fn(),
}));

/** Build a fully-typed MatchResult so tests don't need `as any`. */
function matchResult(overrides: Partial<MatchResult>): MatchResult {
  return {
    decision: "UNMATCHED",
    matchedCycleId: null,
    matchedMembershipId: null,
    amountAppliedToPot: 0,
    amountToBuffer: 0,
    contributionStatus: null,
    newContributionAmount: 0,
    ...overrides,
  };
}

describe("dispatchWebhookEvent", () => {
  const mockReceipt = {
    id: "receipt-1",
    providerEventId: "evt-1",
  } as unknown as WebhookReceipt;
  const mockPayload = {
    event_type: "payment_success",
    data: {
      transaction: {
        aliasAccountReference: "ref-1",
        amount: "50.00",
        transactionId: "tx-1",
      },
    },
  } as unknown as NombaWebhookPayload;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles UNKNOWN_VA by updating receipt and exiting early", async () => {
    vi.mocked(prisma.virtualAccount.findUnique).mockResolvedValue(null);
    vi.mocked(matchInboundTransfer).mockReturnValue(matchResult({ decision: "UNKNOWN_VA" }));

    await dispatchWebhookEvent(mockReceipt, mockPayload);

    expect(prisma.webhookReceipt.update).toHaveBeenCalledWith({
      where: { id: "receipt-1" },
      data: { processingError: "unknown aliasAccountReference" },
    });
    expect(prisma.inboundTransfer.create).not.toHaveBeenCalled();
  });

  it("treats P2002 on InboundTransfer create as success (no double pot increment)", async () => {
    vi.mocked(prisma.virtualAccount.findUnique).mockResolvedValue({
      id: "va-1",
    } as unknown as VirtualAccount);
    vi.mocked(matchInboundTransfer).mockReturnValue(
      matchResult({
        decision: "MATCHED",
        matchedCycleId: "cy-1",
        matchedMembershipId: "mem-1",
        amountAppliedToPot: 5000,
        contributionStatus: "COMPLETE",
        newContributionAmount: 5000,
      }),
    );

    vi.mocked(prisma.inboundTransfer.create).mockRejectedValue({ code: "P2002" });

    await dispatchWebhookEvent(mockReceipt, mockPayload);

    // Should return gracefully, meaning no cycle update
    expect(prisma.cycle.update).not.toHaveBeenCalled();
  });

  it("persists UNMATCHED and returns 200 without updating pot", async () => {
    vi.mocked(prisma.virtualAccount.findUnique).mockResolvedValue({
      id: "va-1",
    } as unknown as VirtualAccount);
    vi.mocked(matchInboundTransfer).mockReturnValue(matchResult({ decision: "UNMATCHED" }));

    await dispatchWebhookEvent(mockReceipt, mockPayload);

    expect(prisma.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchStatus: "UNMATCHED" }),
      }),
    );
    expect(prisma.cycle.update).not.toHaveBeenCalled();
  });

  it("processes MATCHED, increments pot, splits buffer, and guards READY_TO_PAYOUT flip", async () => {
    vi.mocked(matchInboundTransfer).mockReturnValue(
      matchResult({
        decision: "OVERPAID",
        matchedCycleId: "cy-1",
        matchedMembershipId: "mem-1",
        amountAppliedToPot: 3000,
        amountToBuffer: 2000,
        contributionStatus: "COMPLETE",
        newContributionAmount: 5000,
      }),
    );

    vi.mocked(prisma.inboundTransfer.create).mockResolvedValue({} as unknown as InboundTransfer);
    vi.mocked(prisma.cycle.update).mockResolvedValue({
      id: "cy-1",
      potCollectedMinor: 5000,
      potExpectedMinor: 5000,
      status: "OPEN",
    } as unknown as Cycle);

    vi.mocked(prisma.virtualAccount.findUnique).mockResolvedValue({
      id: "va-1",
    } as unknown as VirtualAccount);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: "mem-1",
      userId: "user-1",
    } as unknown as Membership);

    await dispatchWebhookEvent(mockReceipt, mockPayload);

    expect(prisma.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchStatus: "OVERPAID" }),
      }),
    );

    // Upsert contribution
    expect(prisma.contribution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { amountMinor: 5000, status: "COMPLETE" },
      }),
    );

    // Split buffer
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-1" },
        data: { bufferMinor: { increment: 2000 } },
      }),
    );

    // Pot incremented
    expect(prisma.cycle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cy-1" },
        data: { potCollectedMinor: { increment: 3000 } },
      }),
    );

    // Status flip to READY_TO_PAYOUT
    expect(prisma.cycle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cy-1" },
        data: { status: "READY_TO_PAYOUT" },
      }),
    );
  });
});

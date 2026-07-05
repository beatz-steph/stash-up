import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectFromWallet } from "./waterfall";
import { prisma } from "@workspace/db";
import { debitWallet } from "./ledger";
import { applyContributionSplit } from "../reconciliation/apply";
import { notifyContributionReceived } from "@/lib/notifications";

vi.mock("./ledger", () => ({ debitWallet: vi.fn() }));
vi.mock("../reconciliation/apply", () => ({ applyContributionSplit: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifyContributionReceived: vi.fn() }));

const tx = {
  contribution: { findUnique: vi.fn() },
  inboundTransfer: { create: vi.fn() },
};
vi.mock("@workspace/db", () => ({
  Prisma: {},
  prisma: {
    walletAccount: { findUnique: vi.fn() },
    contribution: { findUnique: vi.fn() },
    cycle: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const params = {
  userId: "u1",
  membershipId: "m1",
  cycleId: "cyc1",
  contributionMinor: 1_000_000, // ₦10,000
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
    (fn as (t: typeof tx) => unknown)(tx)
  );
  tx.contribution.findUnique.mockResolvedValue({ amountMinor: 0 }); // inner fresh read
  vi.mocked(debitWallet).mockResolvedValue({ applied: true, balanceAfterMinor: 0 });
  vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
    sequence: 3,
    circle: { id: "c1", name: "Test Circle" },
  } as never);
});

describe("collectFromWallet (waterfall)", () => {
  it("debits only what the wallet can cover and reports the remainder", async () => {
    vi.mocked(prisma.walletAccount.findUnique).mockResolvedValue({ balanceMinor: 400_000 } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 0 } as never);

    const res = await collectFromWallet(params);
    expect(res).toEqual({ debitedMinor: 400_000, remainingDueMinor: 600_000 });
    expect(debitWallet).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amountMinor: 400_000, source: "CIRCLE_DEBIT" })
    );
    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "WALLET", matchStatus: "UNDERPAID" }) })
    );
    expect(applyContributionSplit).toHaveBeenCalled();
  });

  it("covers the full contribution when the balance is enough (MATCHED)", async () => {
    vi.mocked(prisma.walletAccount.findUnique).mockResolvedValue({ balanceMinor: 1_200_000 } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 0 } as never);

    const res = await collectFromWallet(params);
    expect(res).toEqual({ debitedMinor: 1_000_000, remainingDueMinor: 0 });
    const splitArg = vi.mocked(applyContributionSplit).mock.calls[0]![1];
    expect(splitArg.decision).toBe("MATCHED");
    expect(splitArg.contributionStatus).toBe("COMPLETE");
    // The member is alerted their wallet paid the contribution.
    expect(notifyContributionReceived).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", amountMinor: 1_000_000, circleName: "Test Circle" })
    );
  });

  it("does not notify when nothing was debited", async () => {
    vi.mocked(prisma.walletAccount.findUnique).mockResolvedValue({ balanceMinor: 0 } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 0 } as never);
    await collectFromWallet(params);
    expect(notifyContributionReceived).not.toHaveBeenCalled();
  });

  it("does nothing when the wallet is empty", async () => {
    vi.mocked(prisma.walletAccount.findUnique).mockResolvedValue({ balanceMinor: 0 } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 0 } as never);

    const res = await collectFromWallet(params);
    expect(res).toEqual({ debitedMinor: 0, remainingDueMinor: 1_000_000 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does nothing when the member is already paid up", async () => {
    vi.mocked(prisma.walletAccount.findUnique).mockResolvedValue({ balanceMinor: 500_000 } as never);
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({ amountMinor: 1_000_000 } as never);

    const res = await collectFromWallet(params);
    expect(res).toEqual({ debitedMinor: 0, remainingDueMinor: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

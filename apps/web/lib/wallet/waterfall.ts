import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "@workspace/db";
import type { MatchResult } from "../reconciliation/match";
import { applyContributionSplit } from "../reconciliation/apply";
import { computeRemainingDue } from "../cards/enrollment";
import { debitWallet } from "./ledger";
import { notifyContributionReceived } from "@/lib/notifications";

/**
 * Wallet-first collection for a member's cycle contribution. Debits the wallet
 * up to what's still owed and applies it to the pot — atomically, and only when
 * the member has opted in (`autoDebitWallet`). Shared by the debit sweep and the
 * per-circle auto-debit route so the wallet→card waterfall lives in one place.
 *
 * Returns how much was debited and the remaining due AFTER — the caller then
 * charges a bound card for any remainder. A wallet debit is an internal ledger
 * move: instant, free, and cannot fail (beyond insufficient funds, which just
 * means we debit less).
 *
 * Race-safe: the authoritative amounts are recomputed inside the tx, and the
 * debit is capped at the freshly-read remaining, so a transfer landing between
 * the outer read and the tx can never over-collect. The wallet row lock in
 * `debitWallet` serialises concurrent debits.
 */
export async function collectFromWallet(params: {
  userId: string;
  membershipId: string;
  cycleId: string;
  contributionMinor: number;
}): Promise<{ debitedMinor: number; remainingDueMinor: number }> {
  const { userId, membershipId, cycleId, contributionMinor } = params;

  // Cheap pre-check to avoid opening a tx when there's nothing to do.
  const [wallet, contribution] = await Promise.all([
    prisma.walletAccount.findUnique({ where: { userId }, select: { balanceMinor: true } }),
    prisma.contribution.findUnique({
      where: { cycleId_membershipId: { cycleId, membershipId } },
      select: { amountMinor: true },
    }),
  ]);
  const remainingDue = computeRemainingDue(contributionMinor, contribution?.amountMinor ?? 0);
  const balance = wallet?.balanceMinor ?? 0;
  if (remainingDue <= 0 || balance <= 0) {
    return { debitedMinor: 0, remainingDueMinor: remainingDue };
  }

  let debitedMinor = 0;
  let remainingDueMinor = remainingDue;
  const nonce = randomUUID();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Recompute against fresh state inside the tx (a transfer may have landed).
    const fresh = await tx.contribution.findUnique({
      where: { cycleId_membershipId: { cycleId, membershipId } },
      select: { amountMinor: true },
    });
    const paid = fresh?.amountMinor ?? 0;
    const remaining = computeRemainingDue(contributionMinor, paid);
    const debit = Math.min(remaining, balance);
    if (debit <= 0) {
      remainingDueMinor = remaining;
      return;
    }

    // Guarded debit — throws WalletInsufficientFundsError if the balance moved
    // below `debit`, rolling back the whole tx (nothing applied).
    const res = await debitWallet(tx, {
      userId,
      amountMinor: debit,
      source: "CIRCLE_DEBIT",
      reference: cycleId,
      idempotencyKey: `cd_${cycleId}_${membershipId}_${nonce}`,
    });
    if (!res.applied) {
      remainingDueMinor = remaining;
      return;
    }

    const newContribution = paid + debit;
    const decision: MatchResult["decision"] =
      newContribution >= contributionMinor ? "MATCHED" : "UNDERPAID";

    // A wallet debit is always ≤ remaining, so it's all pot, never buffer.
    const result: MatchResult = {
      decision,
      matchedCycleId: cycleId,
      matchedMembershipId: membershipId,
      amountAppliedToPot: debit,
      amountToBuffer: 0,
      contributionStatus: newContribution >= contributionMinor ? "COMPLETE" : "PARTIAL",
      newContributionAmount: newContribution,
    };

    // Feed row + idempotency (unique providerEventId).
    await tx.inboundTransfer.create({
      data: {
        provider: "NOMBA",
        source: "WALLET",
        providerEventId: `wallet_${cycleId}_${membershipId}_${nonce}`,
        nombaTransactionId: "",
        amountMinor: debit,
        currency: "NGN",
        narration: "Wallet auto-save",
        matchStatus: decision,
        matchedCycleId: cycleId,
        matchedMembershipId: membershipId,
        receivedAt: new Date(),
      },
    });

    await applyContributionSplit(tx, result);

    debitedMinor = debit;
    remainingDueMinor = remaining - debit;
  });

  // Alert the member their wallet paid this cycle's contribution (best-effort —
  // a notification failure must never affect the money move).
  if (debitedMinor > 0) {
    try {
      const info = await prisma.cycle.findUnique({
        where: { id: cycleId },
        select: { sequence: true, circle: { select: { id: true, name: true } } },
      });
      if (info?.circle) {
        await notifyContributionReceived({
          userId,
          amountMinor: debitedMinor,
          circleName: info.circle.name,
          circleId: info.circle.id,
          cycleSequence: info.sequence,
        });
      }
    } catch (err) {
      console.error(
        "[waterfall] contribution notification failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return { debitedMinor, remainingDueMinor };
}

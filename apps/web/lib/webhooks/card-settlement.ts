import { prisma, Prisma } from "@workspace/db";
import type { WebhookReceipt, ChargeAttempt } from "@workspace/db";
import { NombaWebhookPayload } from "./verify";
import { matchInboundTransfer, MatchContext } from "../reconciliation/match";
import { applyContributionSplit } from "../reconciliation/apply";
import { handleWalletCardTopup } from "./wallet-topup";
import { createNotification, notifyContributionReceived } from "@/lib/notifications";
import { CARD_FEE_RATE } from "@/lib/fees";
import { formatNaira } from "@/lib/money";

/** Is this a card settlement (vs a VA transfer)? Discriminated by the
 * transaction type Nomba sends for hosted-checkout card payments. */
export function isCardSettlement(payload: NombaWebhookPayload): boolean {
  const type = payload.data?.transaction?.type ?? "";
  return type === "online_checkout" || !!payload.data?.order;
}

/**
 * Handle a successful card settlement (payment_success, type online_checkout).
 * Cards are one-time hosted-checkout payments on this account — nothing is
 * tokenized or saved. Two flavours, routed by orderMetaData.kind / the
 * orderReference prefix:
 *  - wallettopup: credit the member's wallet (delegated to wallet-topup).
 *  - cardchg: apply the payment as this cycle's contribution.
 * Idempotent: guards on the ChargeAttempt status and the InboundTransfer
 * unique (provider, providerEventId).
 */
export async function handleCardSettlement(
  receipt: WebhookReceipt,
  payload: NombaWebhookPayload
): Promise<void> {
  const order = payload.data?.order;
  const transaction = payload.data?.transaction;

  const meta = order?.orderMetaData;
  const orderRef = order?.orderReference ?? "";

  // Wallet card top-up: a checkout tagged for the wallet — credit the wallet.
  if (meta?.kind === "wallettopup" || orderRef.startsWith("wallettopup_")) {
    await handleWalletCardTopup(receipt, payload);
    return;
  }

  const isContribution = meta?.kind === "cardchg" || orderRef.startsWith("cardchg_");
  if (!isContribution) {
    console.warn(`[card-webhook] unroutable settlement (ref=${orderRef})`);
    return;
  }

  const nombaTxId = transaction?.transactionId ?? "";
  const amountMinor = Math.round(Number(transaction?.transactionAmount ?? order?.amount ?? 0) * 100);

  // Locate the ChargeAttempt — prefer metadata attemptId, fall back to our ref.
  const attemptId = meta?.attemptId;
  let attempt =
    attemptId && attemptId !== "disco"
      ? await prisma.chargeAttempt.findUnique({ where: { id: attemptId } })
      : null;
  if (!attempt && orderRef) {
    attempt = await prisma.chargeAttempt.findUnique({ where: { orderReference: orderRef } });
  }
  if (!attempt) {
    console.warn(`[card-webhook] no ChargeAttempt for cardchg ref=${orderRef}`);
    return;
  }
  if (attempt.status === "SUCCESS") {
    return; // already settled — idempotent no-op
  }

  console.log(
    `[card-webhook] settling cardchg attempt=${attempt.id} receipt=${receipt.id} amountMinor=${amountMinor}`
  );

  // Money applies to the cycle's pot. Apply the NET that actually landed
  // (gross charge − Nomba fee); the charge was grossed-up so the net ≈ the
  // intended contribution. The fee is surfaced, never applied to a pot.
  const feeMinor = Math.round(Number(transaction?.fee ?? 0) * 100);
  const netMinor = Math.max(0, amountMinor - feeMinor);
  await settleContribution(attempt, {
    nombaTxId,
    netMinor,
    feeMinor,
    currency: order?.currency ?? "NGN",
    time: transaction?.time,
  });
}

export async function settleContribution(
  attempt: ChargeAttempt,
  data: {
    nombaTxId: string;
    netMinor: number; // amount that landed in the sub-account (applied to the pot)
    feeMinor: number; // surfaced Nomba card fee (never applied to a pot)
    currency: string;
    time?: string;
  }
): Promise<void> {
  if (!attempt.membershipId || !attempt.cycleId) {
    console.warn(`[card-webhook] cardchg attempt ${attempt.id} missing membership/cycle`);
    return;
  }

  // Build the match context from the member's current cycle (mirrors dispatch).
  const membership = await prisma.membership.findUnique({ where: { id: attempt.membershipId } });
  if (!membership) return;
  const circle = await prisma.circle.findUnique({ where: { id: membership.circleId } });
  const cycle = await prisma.cycle.findUnique({ where: { id: attempt.cycleId } });
  const existingContribution = await prisma.contribution.findUnique({
    where: { cycleId_membershipId: { cycleId: attempt.cycleId, membershipId: attempt.membershipId } },
  });

  const ctx: MatchContext = {
    // Synthetic non-null VA — card charges have no VA, but the matcher only
    // null-checks this to short-circuit UNKNOWN_VA (never used for card).
    virtualAccount: { id: "card", accountRef: "card", membershipId: membership.id },
    membership: { id: membership.id, circleId: membership.circleId },
    circle: circle
      ? {
          id: circle.id,
          status: circle.status,
          contributionMinor: circle.contributionMinor,
          currentCycleSeq: circle.currentCycleSeq,
        }
      : null,
    cycle: cycle ? { id: cycle.id, sequence: cycle.sequence, status: cycle.status } : null,
    existingContribution: existingContribution
      ? {
          id: existingContribution.id,
          amountMinor: existingContribution.amountMinor,
          status: existingContribution.status,
        }
      : null,
  };

  const result = matchInboundTransfer(data.netMinor, "card", ctx);
  const eligible = result.decision !== "UNKNOWN_VA" && result.decision !== "UNMATCHED";

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // InboundTransfer row: shows in the member feed + business idempotency
    // (unique provider+providerEventId → duplicate webhook is a no-op).
    try {
      await tx.inboundTransfer.create({
        data: {
          provider: "NOMBA",
          source: "CARD",
          // Deterministic per-attempt key so the webhook and the verify-backstop
          // (Stage 4) can never double-apply the same charge — whichever runs
          // first wins; the other hits this unique and no-ops.
          providerEventId: `card_${attempt.id}`,
          nombaTransactionId: data.nombaTxId,
          amountMinor: data.netMinor,
          feeMinor: data.feeMinor,
          currency: data.currency,
          narration: "Card contribution",
          matchStatus: eligible
            ? (result.decision as "MATCHED" | "UNDERPAID" | "OVERPAID")
            : "UNMATCHED",
          matchedCycleId: eligible ? result.matchedCycleId : null,
          matchedMembershipId: membership.id,
          receivedAt: new Date(data.time ?? Date.now()),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return; // already applied
      throw err;
    }

    await tx.chargeAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "SUCCESS",
        nombaTransactionId: data.nombaTxId,
        feeMinor: data.feeMinor,
        settledAt: new Date(),
      },
    });

    if (eligible) {
      await applyContributionSplit(tx, result);
    } else {
      // Cycle closed / already paid before this charge settled — the member's
      // money is never lost; it becomes carried-over credit (race acceptance).
      await tx.membership.update({
        where: { id: membership.id },
        data: { bufferMinor: { increment: data.netMinor } },
      });
    }
  });

  if (eligible) {
    await notifyContributionReceived({
      userId: attempt.userId,
      amountMinor: data.netMinor,
      circleName: circle?.name ?? "your circle",
      circleId: membership.circleId,
      cycleSequence: cycle?.sequence,
    });
  } else {
    // Cycle already closed/paid — the money became carried-over credit.
    await createNotification({
      userId: attempt.userId,
      type: "GENERIC",
      title: "Payment received",
      body: `${formatNaira(data.netMinor)} from your card was received and saved as credit toward your next cycle.`,
    });
  }
}

/**
 * Verify backstop for a one-time card cycle payment (`cardchg`) whose settlement
 * webhook was missed. Applies the NET to the cycle's pot using the exact fee/
 * amount when Nomba reports them, else estimates from the grossed charge.
 * Idempotent with the webhook via the shared `card_<attemptId>` InboundTransfer
 * key.
 */
export async function settleCardChargeFromVerify(
  attempt: ChargeAttempt,
  verify: { transactionId: string | null; feeMinor: number | null; grossMinor: number | null }
): Promise<void> {
  const grossMinor = verify.grossMinor ?? attempt.amountMinor; // charged (gross)
  const feeMinor =
    verify.feeMinor ?? grossMinor - Math.round(grossMinor * (1 - CARD_FEE_RATE));
  const netMinor = Math.max(0, grossMinor - feeMinor);
  await settleContribution(attempt, {
    nombaTxId: verify.transactionId ?? "",
    netMinor,
    feeMinor,
    currency: "NGN",
    time: undefined,
  });
}

/**
 * Handle a failed card settlement (payment_failed for a checkout/card order).
 * Marks the one-time attempt FAILED and notifies the member. Nothing is saved,
 * so there's no card to retire.
 */
export async function handleCardFailure(payload: NombaWebhookPayload): Promise<void> {
  const order = payload.data?.order;
  const transaction = payload.data?.transaction;
  const meta = order?.orderMetaData;
  const orderRef = order?.orderReference ?? "";
  const isContribution = meta?.kind === "cardchg" || orderRef.startsWith("cardchg_");
  if (!isContribution) return;

  const attemptId = meta?.attemptId;
  let attempt =
    attemptId && attemptId !== "disco"
      ? await prisma.chargeAttempt.findUnique({ where: { id: attemptId } })
      : null;
  if (!attempt && orderRef) {
    attempt = await prisma.chargeAttempt.findUnique({ where: { orderReference: orderRef } });
  }
  if (!attempt || attempt.status !== "PENDING") return;

  const reason = transaction?.responseCode || "card_charge_failed";

  await prisma.chargeAttempt.update({
    where: { id: attempt.id },
    data: { status: "FAILED", failureReason: reason },
  });

  await createNotification({
    userId: attempt.userId,
    type: "GENERIC",
    title: "Card payment failed",
    body: "We couldn't collect your contribution by card. Please try again, or pay by bank transfer.",
  });
}

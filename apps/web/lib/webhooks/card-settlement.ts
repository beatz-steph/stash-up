import { prisma, Prisma } from "@workspace/db";
import type { WebhookReceipt, ChargeAttempt } from "@workspace/db";
import { NombaWebhookPayload } from "./verify";
import { matchInboundTransfer, MatchContext } from "../reconciliation/match";
import { applyContributionSplit } from "../reconciliation/apply";
import { creditWallet } from "@/lib/wallet/ledger";
import { handleWalletCardTopup } from "./wallet-topup";
import { createNotification } from "@/lib/notifications";
import { CARD_FEE_RATE } from "@/lib/fees";
import { isUsableCardToken } from "@/lib/cards/enrollment";

type CardKind = "cardenroll" | "cardverify" | "cardchg";

/** Route a settlement by its orderMetaData.kind, falling back to the
 * orderReference prefix (both are echoed back by Nomba). */
function deriveKind(
  meta: Record<string, string> | undefined,
  orderRef: string
): CardKind | null {
  const k = meta?.kind;
  if (k === "cardenroll" || k === "cardverify" || k === "cardchg") return k;
  if (orderRef.startsWith("cardenroll_")) return "cardenroll";
  if (orderRef.startsWith("cardverify_")) return "cardverify";
  if (orderRef.startsWith("cardchg_")) return "cardchg";
  return null;
}

/** Is this a card settlement (vs a VA transfer)? Discriminated by the
 * transaction type Nomba sends for hosted checkout / tokenized-card payments. */
export function isCardSettlement(payload: NombaWebhookPayload): boolean {
  const type = payload.data?.transaction?.type ?? "";
  return type === "online_checkout" || !!payload.data?.order;
}

/**
 * Handle a successful card settlement (payment_success, type online_checkout).
 * Three kinds, routed by orderMetaData.kind:
 *  - cardverify: create the SavedCard, bind if the attempt has a membership,
 *    mark SUCCESS + refundStatus PENDING, then refund the ₦50 (best-effort).
 *    The ₦50 is NEVER applied to any pot — it's a verification hold.
 *  - cardenroll: create + bind the SavedCard AND apply the payment as this
 *    cycle's contribution (the enrollment charge IS the contribution).
 *  - cardchg: apply the tokenized-charge payment as a contribution.
 * Idempotent: guards on the ChargeAttempt status and the InboundTransfer
 * unique (provider, providerEventId).
 */
export async function handleCardSettlement(
  receipt: WebhookReceipt,
  payload: NombaWebhookPayload
): Promise<void> {
  const order = payload.data?.order;
  const tokenized = payload.data?.tokenizedCardData;
  const transaction = payload.data?.transaction;

  const meta = order?.orderMetaData;
  const orderRef = order?.orderReference ?? "";

  // Wallet card top-up: a checkout with no ChargeAttempt — credit the wallet.
  if (meta?.kind === "wallettopup" || orderRef.startsWith("wallettopup_")) {
    await handleWalletCardTopup(receipt, payload);
    return;
  }

  const kind = deriveKind(meta, orderRef);
  const nombaTxId = transaction?.transactionId ?? "";
  const amountMinor = Math.round(Number(transaction?.transactionAmount ?? order?.amount ?? 0) * 100);

  if (!kind) {
    console.warn(`[card-webhook] unroutable settlement (ref=${orderRef})`);
    return;
  }

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
    console.warn(`[card-webhook] no ChargeAttempt for kind=${kind} ref=${orderRef}`);
    return;
  }
  if (attempt.status === "SUCCESS") {
    return; // already settled — idempotent no-op
  }

  const tokenKey = tokenized?.tokenKey;
  const last4 = order?.cardLast4Digits ?? null;
  const cardType = tokenized?.cardType ?? order?.cardType ?? null;

  console.log(
    `[card-webhook] settling kind=${kind} attempt=${attempt.id} receipt=${receipt.id} amountMinor=${amountMinor}`
  );

  if (kind === "cardverify") {
    const feeMinor = Math.round(Number(transaction?.fee ?? 0) * 100);
    await settleVerification(attempt, {
      tokenKey,
      last4,
      cardType,
      nombaTxId,
      // Credit the NET that actually landed (the fee is surfaced to the customer,
      // per the fee policy — we never had the fee portion to give back).
      creditMinor: Math.max(0, amountMinor - feeMinor),
      feeMinor,
    });
    return;
  }

  // cardenroll / cardchg — money applies to the cycle's pot. Apply the NET that
  // actually landed (gross charge − Nomba fee); the charge was grossed-up so the
  // net ≈ the intended contribution. The fee is surfaced, never applied to a pot.
  const feeMinor = Math.round(Number(transaction?.fee ?? 0) * 100);
  const netMinor = Math.max(0, amountMinor - feeMinor);
  await settleContribution(attempt, kind, {
    tokenKey,
    last4,
    cardType,
    nombaTxId,
    netMinor,
    feeMinor,
    currency: order?.currency ?? "NGN",
    time: transaction?.time,
  });
}

async function settleVerification(
  attempt: ChargeAttempt,
  card: {
    tokenKey?: string;
    last4: string | null;
    cardType: string | null;
    nombaTxId: string;
    creditMinor: number;
    feeMinor: number;
  }
): Promise<void> {
  // Nomba's refund API rejects real settled charges in this environment, so the
  // ₦50 verification hold is returned as wallet store-credit instead (disclosed
  // to the customer). Everything happens in one tx — card save, mark SUCCESS,
  // and the wallet credit — so it's atomic and needs no external call.
  const tokenized = isUsableCardToken(card.tokenKey);
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let savedCardId: string | null = null;
    if (tokenized) {
      const saved = await tx.savedCard.create({
        data: {
          userId: attempt.userId,
          provider: "NOMBA",
          tokenKey: card.tokenKey!,
          last4: card.last4,
          cardType: card.cardType,
          status: "ACTIVE",
        },
      });
      savedCardId = saved.id;
      // Path B verification records the membership so we can bind here; the
      // Settings path (Path C) has no membership → the card binds to nothing.
      if (attempt.membershipId) {
        await tx.membership.update({
          where: { id: attempt.membershipId },
          data: { autoDebitCardId: saved.id },
        });
      }
    }

    await tx.chargeAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "SUCCESS",
        savedCardId,
        nombaTransactionId: card.nombaTxId,
        feeMinor: card.feeMinor,
        settledAt: new Date(),
        // "REFUNDED" = the hold has been returned (as wallet credit here), so the
        // sweep's refund-retry never picks it up.
        refundStatus: "REFUNDED",
        refundedAt: new Date(),
      },
    });

    if (card.creditMinor > 0) {
      await creditWallet(tx, {
        userId: attempt.userId,
        amountMinor: card.creditMinor,
        source: "REFUND_CREDIT",
        reference: attempt.id,
        idempotencyKey: `verify_${attempt.id}`,
      });
    }
  });

  await createNotification({
    userId: attempt.userId,
    type: "GENERIC",
    title: tokenized ? "Card added" : "Card couldn't be saved",
    body: tokenized
      ? "Your card was saved. The ₦50 verification charge was added to your StashUp wallet."
      : "We couldn't save this card for future payments (your bank didn't return a reusable token). The ₦50 was added to your StashUp wallet. Please try adding the card again.",
  });
}

export async function settleContribution(
  attempt: ChargeAttempt,
  kind: "cardenroll" | "cardchg",
  data: {
    tokenKey?: string;
    last4: string | null;
    cardType: string | null;
    nombaTxId: string;
    netMinor: number; // amount that landed in the sub-account (applied to the pot)
    feeMinor: number; // surfaced Nomba card fee (never applied to a pot)
    currency: string;
    time?: string;
  }
): Promise<void> {
  if (!attempt.membershipId || !attempt.cycleId) {
    console.warn(`[card-webhook] ${kind} attempt ${attempt.id} missing membership/cycle`);
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
          narration: kind === "cardenroll" ? "Card enrollment" : "Card auto-save",
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

    // Create + bind the SavedCard for enrollment settlements.
    let savedCardId: string | null = attempt.savedCardId;
    if (kind === "cardenroll" && isUsableCardToken(data.tokenKey)) {
      const saved = await tx.savedCard.create({
        data: {
          userId: attempt.userId,
          provider: "NOMBA",
          tokenKey: data.tokenKey,
          last4: data.last4,
          cardType: data.cardType,
          status: "ACTIVE",
        },
      });
      savedCardId = saved.id;
      await tx.membership.update({
        where: { id: membership.id },
        data: { autoDebitCardId: saved.id },
      });
    }

    await tx.chargeAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "SUCCESS",
        savedCardId,
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

  await createNotification({
    userId: attempt.userId,
    type: "GENERIC",
    title: kind === "cardenroll" ? "Auto-save on" : "Contribution collected",
    body:
      kind === "cardenroll"
        ? "Your card was saved and this cycle's contribution was collected automatically."
        : "We collected this cycle's contribution from your saved card.",
  });
}

/**
 * Verify backstop for a saved-card cycle payment (`cardchg`) whose settlement
 * webhook was missed. Applies the NET to the cycle's pot using the exact fee/
 * amount when Nomba reports them, else estimates from the grossed charge.
 * Idempotent with the webhook via the shared `card_<attemptId>` InboundTransfer
 * key. Only cardchg (saved card) is settleable here — cardenroll/cardverify
 * need the tokenKey that ONLY the webhook carries, so those still wait for it.
 */
export async function settleCardChargeFromVerify(
  attempt: ChargeAttempt,
  verify: { transactionId: string | null; feeMinor: number | null; grossMinor: number | null }
): Promise<void> {
  const grossMinor = verify.grossMinor ?? attempt.amountMinor; // charged (gross)
  const feeMinor =
    verify.feeMinor ?? grossMinor - Math.round(grossMinor * (1 - CARD_FEE_RATE));
  const netMinor = Math.max(0, grossMinor - feeMinor);
  await settleContribution(attempt, "cardchg", {
    tokenKey: undefined, // saved-card charge — card already exists, nothing to create
    last4: null,
    cardType: null,
    nombaTxId: verify.transactionId ?? "",
    netMinor,
    feeMinor,
    currency: "NGN",
    time: undefined,
  });
}

/**
 * Handle a failed card settlement (payment_failed for a checkout/card order).
 * Marks the attempt FAILED, flags the card EXPIRED on expiry/invalid-card
 * reasons, and notifies the member.
 */
export async function handleCardFailure(payload: NombaWebhookPayload): Promise<void> {
  const order = payload.data?.order;
  const transaction = payload.data?.transaction;
  const meta = order?.orderMetaData;
  const orderRef = order?.orderReference ?? "";
  const kind = deriveKind(meta, orderRef);
  if (!kind) return;

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
  const isCardDead = /expir|invalid|declin/i.test(reason);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.chargeAttempt.update({
      where: { id: attempt!.id },
      data: { status: "FAILED", failureReason: reason },
    });
    if (isCardDead && attempt!.savedCardId) {
      await tx.savedCard.update({
        where: { id: attempt!.savedCardId },
        data: { status: "EXPIRED" },
      });
    }
  });

  await createNotification({
    userId: attempt.userId,
    type: "GENERIC",
    title: "Card payment failed",
    body: isCardDead
      ? "Your saved card could not be charged (it may be expired). Please add a new card."
      : "We couldn't collect your contribution by card. We'll try again, or you can transfer manually.",
  });
}

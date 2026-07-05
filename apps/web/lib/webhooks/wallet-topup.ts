import { prisma, Prisma } from "@workspace/db";
import type { WebhookReceipt, VirtualAccount, ChargeAttempt } from "@workspace/db";
import { NombaWebhookPayload } from "./verify";
import { creditWallet } from "@/lib/wallet/ledger";
import { createNotification } from "@/lib/notifications";
import { formatNaira } from "@/lib/money";
import { CARD_FEE_RATE } from "@/lib/fees";

/**
 * Bank-transfer top-up: a `payment_success` on a `kind: WALLET` virtual
 * account. Records an `InboundTransfer{ source: "WALLET_TOPUP" }` (feed +
 * webhook-level idempotency) AND credits the wallet ledger, in one tx.
 * The InboundTransfer row is mandatory — without it the orphan-spool would
 * flag every wallet top-up as an unattributed credit.
 */
export async function handleWalletBankTopup(
  receipt: WebhookReceipt,
  payload: NombaWebhookPayload,
  virtualAccount: VirtualAccount
): Promise<void> {
  const transaction = payload.data?.transaction;
  const amountMinor = Math.round(Number(transaction?.transactionAmount ?? 0) * 100);
  const nombaTxId = transaction?.transactionId ?? "";

  if (!virtualAccount.userId || amountMinor <= 0) {
    console.warn(`[wallet-topup] bank credit with no userId/amount (va=${virtualAccount.id})`);
    return;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let inbound;
    try {
      inbound = await tx.inboundTransfer.create({
        data: {
          provider: "NOMBA",
          source: "WALLET_TOPUP",
          providerEventId: receipt.providerEventId,
          nombaTransactionId: nombaTxId,
          aliasAccountRef: virtualAccount.accountRef,
          virtualAccountId: virtualAccount.id,
          amountMinor,
          currency: transaction?.currency || "NGN",
          senderName: transaction?.senderName,
          senderBank: transaction?.senderBank,
          senderBankCode: transaction?.senderBankCode,
          senderAccountNumber: transaction?.senderAccountNumber,
          narration: transaction?.narration,
          matchStatus: "MATCHED", // attributed to the wallet, not a circle
          receivedAt: new Date(transaction?.time || Date.now()),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return; // duplicate webhook
      throw err;
    }

    await creditWallet(tx, {
      userId: virtualAccount.userId!,
      amountMinor,
      source: "TOPUP_BANK",
      reference: inbound.id,
      idempotencyKey: `topup_${inbound.id}`,
    });
  });

  await createNotification({
    userId: virtualAccount.userId,
    type: "GENERIC",
    title: "Wallet topped up",
    body: `${formatNaira(amountMinor)} was added to your StashUp wallet.`,
  });
}

/**
 * The one place a card top-up actually moves money — shared by the settlement
 * webhook (fast path) and the verify backstop (missed-webhook path). Both key
 * the InboundTransfer on the SAME `providerEventId`, so whichever runs first
 * wins and the other is a P2002 no-op — the wallet is credited exactly once.
 * Marking the durable ChargeAttempt SUCCESS (when present) is what lets a
 * saved-card top-up be reconciled by the sweep.
 */
async function applyWalletTopupCredit(params: {
  userId: string;
  netMinor: number;
  feeMinor: number;
  nombaTxId: string;
  /** InboundTransfer unique key: `topup_<attemptId>` (saved card) or the
   *  webhook event id (new-card checkout, which has no attempt). */
  providerEventId: string;
  currency: string;
  receivedAt: Date;
  /** Durable saved-card top-up record to flip SUCCESS; null for new-card. */
  attemptId: string | null;
  /** New-card checkout tokenizes → save the card here; null for saved card. */
  saveCard: { tokenKey: string; last4: string | null; cardType: string | null } | null;
}): Promise<boolean> {
  let credited = false;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let inbound;
    try {
      inbound = await tx.inboundTransfer.create({
        data: {
          provider: "NOMBA",
          source: "WALLET_TOPUP",
          providerEventId: params.providerEventId,
          nombaTransactionId: params.nombaTxId,
          amountMinor: params.netMinor,
          feeMinor: params.feeMinor,
          currency: params.currency,
          narration: "Wallet card top-up",
          matchStatus: "MATCHED",
          receivedAt: params.receivedAt,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return; // already applied
      throw err;
    }

    await creditWallet(tx, {
      userId: params.userId,
      amountMinor: params.netMinor,
      source: "TOPUP_CARD",
      reference: inbound.id,
      idempotencyKey: `topup_${inbound.id}`,
    });

    if (params.attemptId) {
      await tx.chargeAttempt.update({
        where: { id: params.attemptId },
        data: { status: "SUCCESS", nombaTransactionId: params.nombaTxId, feeMinor: params.feeMinor, settledAt: new Date() },
      });
    }

    // Save the card for future one-tap top-ups. No unique on tokenKey, so
    // dedup here — the same card re-tokenized must not create a second row.
    if (params.saveCard?.tokenKey) {
      const existing = await tx.savedCard.findFirst({
        where: { userId: params.userId, tokenKey: params.saveCard.tokenKey },
        select: { id: true },
      });
      if (!existing) {
        await tx.savedCard.create({
          data: {
            userId: params.userId,
            provider: "NOMBA",
            tokenKey: params.saveCard.tokenKey,
            last4: params.saveCard.last4,
            cardType: params.saveCard.cardType,
            status: "ACTIVE",
          },
        });
      }
    }
    credited = true;
  });

  if (credited) {
    await createNotification({
      userId: params.userId,
      type: "GENERIC",
      title: "Wallet topped up",
      body: `${formatNaira(params.netMinor)} was added to your StashUp wallet.`,
    });
  }
  return credited;
}

/**
 * Card top-up settlement: a `payment_success` checkout tagged
 * `orderMetaData.kind = "wallettopup"`. Credits the NET amount that actually
 * landed (transactionAmount − fee), records the fee, and is idempotent via the
 * InboundTransfer unique key. Saved-card top-ups carry a durable ChargeAttempt
 * (looked up by our orderReference) so the verify backstop can reconcile a
 * missed webhook; new-card top-ups tokenize at checkout, so the card is saved
 * here (deduped on tokenKey) for future one-tap top-ups.
 */
export async function handleWalletCardTopup(
  receipt: WebhookReceipt,
  payload: NombaWebhookPayload
): Promise<void> {
  const transaction = payload.data?.transaction;
  const order = payload.data?.order;
  const tokenized = payload.data?.tokenizedCardData;
  const meta = order?.orderMetaData;
  const userId = meta?.userId;

  const grossMinor = Math.round(Number(transaction?.transactionAmount ?? order?.amount ?? 0) * 100);
  const feeMinor = Math.round(Number(transaction?.fee ?? 0) * 100);
  const netMinor = Math.max(0, grossMinor - feeMinor);
  const nombaTxId = transaction?.transactionId ?? "";

  if (!userId || userId === "disco" || netMinor <= 0) {
    console.warn(`[wallet-topup] card settlement missing userId/amount (ref=${order?.orderReference})`);
    return;
  }

  // Saved-card top-up has a durable attempt keyed by our orderReference; keying
  // the InboundTransfer on it lets the sweep and this webhook converge safely.
  const orderRef = order?.orderReference ?? "";
  const attempt = orderRef
    ? await prisma.chargeAttempt.findUnique({
        where: { orderReference: orderRef },
        select: { id: true, status: true },
      })
    : null;
  if (attempt?.status === "SUCCESS") return; // already reconciled

  await applyWalletTopupCredit({
    userId,
    netMinor,
    feeMinor,
    nombaTxId,
    providerEventId: attempt ? `topup_${attempt.id}` : receipt.providerEventId,
    currency: order?.currency || "NGN",
    receivedAt: new Date(transaction?.time || Date.now()),
    attemptId: attempt?.id ?? null,
    saveCard: tokenized?.tokenKey
      ? {
          tokenKey: tokenized.tokenKey,
          last4: order?.cardLast4Digits ?? null,
          cardType: tokenized.cardType ?? order?.cardType ?? null,
        }
      : null,
  });
}

/**
 * Verify backstop for a saved-card wallet top-up whose settlement webhook was
 * missed. Called by the card-debit sweep for a stale PENDING `TOPUP` attempt
 * that Nomba confirms SUCCESS. Applies the NET credit using the exact fee/amount
 * when Nomba reports them, else estimates from the grossed charge. Idempotent
 * with the webhook via the shared `topup_<attemptId>` key.
 */
export async function settleWalletTopupFromVerify(
  attempt: Pick<ChargeAttempt, "id" | "userId" | "amountMinor">,
  verify: { transactionId: string | null; feeMinor: number | null; grossMinor: number | null }
): Promise<void> {
  const grossMinor = verify.grossMinor ?? attempt.amountMinor; // charged (gross)
  const feeMinor =
    verify.feeMinor ?? grossMinor - Math.round(grossMinor * (1 - CARD_FEE_RATE));
  const netMinor = Math.max(0, grossMinor - feeMinor);
  if (netMinor <= 0) return;

  await applyWalletTopupCredit({
    userId: attempt.userId,
    netMinor,
    feeMinor,
    nombaTxId: verify.transactionId ?? "",
    providerEventId: `topup_${attempt.id}`,
    currency: "NGN",
    receivedAt: new Date(),
    attemptId: attempt.id,
    saveCard: null, // saved-card path — the card already exists
  });
}

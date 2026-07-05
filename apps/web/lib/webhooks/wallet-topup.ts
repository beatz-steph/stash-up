import { prisma, Prisma } from "@workspace/db";
import type { WebhookReceipt, VirtualAccount } from "@workspace/db";
import { NombaWebhookPayload } from "./verify";
import { creditWallet } from "@/lib/wallet/ledger";
import { createNotification } from "@/lib/notifications";
import { formatNaira } from "@/lib/money";

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
 * The one place a card top-up actually moves money. Keys the InboundTransfer on
 * the webhook event id; the webhook-replay cron re-drives a missed webhook, and
 * this same key makes the retry a P2002 no-op — so the wallet is credited
 * exactly once. Cards are never saved.
 */
async function applyWalletTopupCredit(params: {
  userId: string;
  netMinor: number;
  feeMinor: number;
  nombaTxId: string;
  providerEventId: string;
  currency: string;
  receivedAt: Date;
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
 * InboundTransfer unique key (the webhook event id). Cards are never saved, so
 * a missed webhook is recovered by the webhook-replay cron, not a saved-card
 * verify sweep.
 */
export async function handleWalletCardTopup(
  receipt: WebhookReceipt,
  payload: NombaWebhookPayload
): Promise<void> {
  const transaction = payload.data?.transaction;
  const order = payload.data?.order;
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

  await applyWalletTopupCredit({
    userId,
    netMinor,
    feeMinor,
    nombaTxId,
    providerEventId: receipt.providerEventId,
    currency: order?.currency || "NGN",
    receivedAt: new Date(transaction?.time || Date.now()),
  });
}

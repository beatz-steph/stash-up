import { prisma, Prisma } from "@workspace/db";
import { creditWallet } from "@/lib/wallet/ledger";
import { createNotification } from "@/lib/notifications";
import { formatNaira } from "@/lib/money";

/** merchantTxRefs we own for wallet withdrawals. */
export function isWalletWithdrawalRef(ref: string | undefined | null): boolean {
  return !!ref && ref.startsWith("walletwd_");
}

/** payout_success for a wallet withdrawal → mark SUCCESS. Money already left
 * the wallet at request time, so nothing moves here. Idempotent. */
export async function handleWalletWithdrawalSuccess(
  merchantTxRef: string,
  nombaTransferId?: string
): Promise<void> {
  let notifyUserId: string | null = null;
  let notifyAmountMinor = 0;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const wd = await tx.walletWithdrawal.findUnique({
      where: { merchantTxRef },
      include: { wallet: { select: { userId: true } } },
    });
    if (!wd || wd.status === "SUCCESS") return;

    await tx.walletWithdrawal.update({
      where: { id: wd.id },
      data: { status: "SUCCESS", nombaTransferId: nombaTransferId ?? wd.nombaTransferId },
    });
    notifyUserId = wd.wallet.userId;
    notifyAmountMinor = wd.amountMinor;
  });

  if (notifyUserId) {
    await createNotification({
      userId: notifyUserId,
      type: "GENERIC",
      title: "Withdrawal sent",
      body: `${formatNaira(notifyAmountMinor)} has been sent to your bank account.`,
    });
  }
}

/** payout_failed for a wallet withdrawal → mark FAILED and REVERSE the debit
 * (credit amount + fee back to the wallet). Idempotent via the ledger key. */
export async function handleWalletWithdrawalFailed(
  merchantTxRef: string,
  reason: string
): Promise<void> {
  let notifyUserId: string | null = null;
  let notifyAmountMinor = 0;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const wd = await tx.walletWithdrawal.findUnique({
      where: { merchantTxRef },
      include: { wallet: { select: { userId: true } } },
    });
    if (!wd || wd.status === "FAILED") return;

    await tx.walletWithdrawal.update({
      where: { id: wd.id },
      data: { status: "FAILED", failureReason: reason },
    });

    // Reverse the amount + fee that was debited when the withdrawal was created.
    await creditWallet(tx, {
      userId: wd.wallet.userId,
      amountMinor: wd.amountMinor + wd.feeMinor,
      source: "REVERSAL",
      reference: wd.id,
      idempotencyKey: `rev_${wd.id}`,
    });
    notifyUserId = wd.wallet.userId;
    notifyAmountMinor = wd.amountMinor;
  });

  if (notifyUserId) {
    await createNotification({
      userId: notifyUserId,
      type: "GENERIC",
      title: "Withdrawal failed",
      body: `Your ${formatNaira(notifyAmountMinor)} withdrawal could not be completed and has been returned to your wallet.`,
    });
  }
}

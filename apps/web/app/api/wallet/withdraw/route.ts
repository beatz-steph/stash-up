import { randomUUID } from "node:crypto";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { requireVerifiedEmail } from "@/lib/access-control";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { prisma, Prisma } from "@workspace/db";
import { initiateSubAccountBankTransfer } from "@/lib/nomba-client";
import { transferFeeMinor } from "@/lib/fees";
import { ensureWallet, debitWallet, WalletInsufficientFundsError } from "@/lib/wallet/ledger";
import { verifyWalletPin } from "@/lib/wallet/pin";
import { WalletWithdrawReqSchema, type WalletWithdrawRes } from "../dto/wallet.dto";

/**
 * Withdraw from the wallet to the linked bank account. PIN-gated, fee-surfaced.
 * The wallet is debited amount + fee atomically (overdraw-guarded), then the
 * transfer is sent to Nomba with a unique merchantTxRef. Settlement is
 * finalized by the payout_success/payout_failed webhook (which REVERSES on
 * failure) — mirroring the circle-payout posture: a thrown Nomba call may still
 * have settled, so we never auto-reverse synchronously.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return apiError("Unauthorized", 401);

  try {
    requireVerifiedEmail(session.user);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  const parsed = WalletWithdrawReqSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("A valid amount and PIN are required", 422);
  const { amountMinor, pin } = parsed.data;
  const userId = session.user.id;

  if (await isNombaIntegrationDisabled()) {
    return apiError("Withdrawals are temporarily unavailable", 503);
  }

  // PIN gate.
  const verify = await verifyWalletPin(userId, pin);
  if (!verify.ok) {
    if (verify.reason === "no_pin") return apiError("Set a wallet PIN before withdrawing", 409);
    if (verify.reason === "locked") return apiError("Too many PIN attempts. Try again later.", 423);
    return apiError(
      verify.retriesLeft != null
        ? `Incorrect PIN. ${verify.retriesLeft} attempt(s) left.`
        : "Incorrect PIN",
      403
    );
  }

  const withdrawalAccount = await prisma.withdrawalAccount.findUnique({ where: { userId } });
  if (!withdrawalAccount) {
    return apiError("Add a withdrawal bank account first", 400);
  }

  const feeMinor = transferFeeMinor(amountMinor);
  const totalMinor = amountMinor + feeMinor;
  const merchantTxRef = `walletwd_${randomUUID()}`;

  // ── DEBIT + RECORD (atomic) ──
  let withdrawalId: string;
  try {
    withdrawalId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await ensureWallet(tx, userId);
      const withdrawal = await tx.walletWithdrawal.create({
        data: {
          walletId: wallet.id,
          amountMinor,
          feeMinor,
          merchantTxRef,
          status: "INITIATED",
          bankCode: withdrawalAccount.bankCode,
          bankName: withdrawalAccount.bankName,
          accountNumber: withdrawalAccount.accountNumber,
          accountName: withdrawalAccount.accountName,
        },
        select: { id: true },
      });
      // Debit amount + fee. Throws if the balance can't cover it → tx rolls back.
      await debitWallet(tx, {
        userId,
        amountMinor: totalMinor,
        source: "WITHDRAWAL",
        reference: withdrawal.id,
        idempotencyKey: `wd_${withdrawal.id}`,
      });
      return withdrawal.id;
    });
  } catch (err) {
    if (err instanceof WalletInsufficientFundsError) {
      return apiError("Insufficient wallet balance for this amount plus the transfer fee", 400);
    }
    throw err;
  }

  // ── NOMBA TRANSFER (outside any tx) ──
  try {
    const res = await initiateSubAccountBankTransfer({
      amount: amountMinor / 100, // naira
      accountNumber: withdrawalAccount.accountNumber,
      accountName: withdrawalAccount.accountName,
      bankCode: withdrawalAccount.bankCode,
      merchantTxRef,
      narration: "StashUp wallet withdrawal",
    });
    await prisma.walletWithdrawal.update({
      where: { id: withdrawalId },
      data: { nombaTransferId: res.id, status: "INITIATED" },
    });
  } catch (err) {
    // Ambiguous — may still settle. Leave INITIATED for the webhook to finalize;
    // do NOT reverse here (that could double-pay a transfer that did go out).
    console.error(
      "[wallet/withdraw] Nomba transfer threw (webhook will finalize):",
      err instanceof Error ? err.message : err
    );
    await prisma.walletWithdrawal.update({
      where: { id: withdrawalId },
      data: { failureReason: "nomba_initiation_unknown" },
    });
  }

  return apiSuccess<WalletWithdrawRes>({
    withdrawalId,
    status: "INITIATED",
    amountMinor,
    feeMinor,
  });
}

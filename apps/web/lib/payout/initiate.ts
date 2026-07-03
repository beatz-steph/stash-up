import { prisma, Prisma } from "@workspace/db";
import { acquirePayoutLock, releasePayoutLock } from "@/lib/redis";
import { initiateSubAccountBankTransfer } from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { payoutNarration } from "@/lib/nomba-format";

export async function initiatePayout(cycleId: string): Promise<void> {
  const locked = await acquirePayoutLock(cycleId);
  if (!locked) {
    throw new Error("Could not acquire payout lock");
  }

  try {
    const merchantTxRef = `payout_${cycleId}`; // Sprint 5 one-shot ref

    // ── CLAIM TX ── returns the values the Nomba call needs, so nothing is read
    // through a non-null assertion on an outer `let` after the transaction.
    const { amountMinor, wa, narration } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cycle = await tx.cycle.findUnique({
        where: { id: cycleId },
        include: { recipientMembership: true, circle: { select: { name: true } } },
      });

      if (!cycle) throw new Error("Cycle not found");
      if (cycle.status !== "READY_TO_PAYOUT") {
        throw new Error("Cycle is not READY_TO_PAYOUT");
      }

      if (await isNombaIntegrationDisabled(tx)) {
        throw new Error("Nomba integration is disabled");
      }

      const withdrawalAccount = await tx.withdrawalAccount.findUnique({
        where: { userId: cycle.recipientMembership.userId },
      });

      if (!withdrawalAccount) {
        throw new Error("Recipient has no withdrawal account");
      }

      try {
        await tx.payout.create({
          data: {
            cycleId,
            recipientMembershipId: cycle.recipientMembershipId,
            amountMinor: cycle.potExpectedMinor,
            merchantTxRef,
            recipientAccountNumber: withdrawalAccount.accountNumber,
            recipientBankCode: withdrawalAccount.bankCode,
            recipientBankName: withdrawalAccount.bankName,
            recipientAccountName: withdrawalAccount.accountName,
            status: "INITIATED",
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") {
          throw new Error("Payout already initiated");
        }
        throw e;
      }

      await tx.cycle.update({
        where: { id: cycleId },
        data: { status: "PAYOUT_INITIATED" },
      });

      return {
        amountMinor: cycle.potExpectedMinor,
        wa: withdrawalAccount,
        narration: payoutNarration(cycle.circle.name, cycle.sequence),
      };
    });

    // ── NOMBA CALL (OUTSIDE any tx) ──
    let transferId: string | undefined;
    let nombaStatus: string | undefined;
    let nombaError: unknown;

    try {
      const res = await initiateSubAccountBankTransfer({
        amount: amountMinor / 100, // naira
        accountNumber: wa.accountNumber,
        accountName: wa.accountName,
        bankCode: wa.bankCode,
        merchantTxRef,
        narration,
      });
      transferId = res.id;
      nombaStatus = res.status;
    } catch (err) {
      nombaError = err;
    }

    // ── RESULT TX ──
    if (nombaError) {
      // Phase 2 Nomba throw: leave cycle at PAYOUT_INITIATED, set Payout.nombaStatus = "UNKNOWN"
      await prisma.payout.update({
        where: { merchantTxRef },
        data: {
          nombaStatus: "UNKNOWN",
          failureReason: String(nombaError),
          // DO NOT mark FAILED here — let the webhook finalize.
        },
      });
      throw new Error(`Nomba initiation failed: ${nombaError}`);
    } else {
      // Success response from Nomba
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const payout = await tx.payout.findUnique({ where: { merchantTxRef } });
        if (payout && payout.status === "INITIATED") {
          await tx.payout.update({
            where: { merchantTxRef },
            data: { nombaTransferId: transferId, nombaStatus },
          });
        }
      });
    }
  } finally {
    await releasePayoutLock(cycleId);
  }
}

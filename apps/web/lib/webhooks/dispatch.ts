import { prisma, Prisma } from "@workspace/db";
import type { WebhookReceipt } from "@workspace/db";
import { NombaWebhookPayload } from "./verify";
import { matchInboundTransfer, MatchContext } from "../reconciliation/match";
import { applyContributionSplit } from "../reconciliation/apply";
import {
  isCardSettlement,
  handleCardSettlement,
  handleCardFailure,
} from "./card-settlement";
import { handleWalletBankTopup } from "./wallet-topup";
import {
  isWalletWithdrawalRef,
  handleWalletWithdrawalSuccess,
  handleWalletWithdrawalFailed,
} from "./wallet-withdrawal";
import { advanceRotation } from "../payout/rotation";
import { createNotification, notifyContributionReceived } from "@/lib/notifications";
import { formatNaira } from "@/lib/money";
import { sendEmail } from "@/lib/email/send";
import { PayoutReceivedEmail } from "@/lib/email/templates/payout-received";
export async function dispatchWebhookEvent(
  receipt: WebhookReceipt,
  payload: NombaWebhookPayload
): Promise<void> {
  const eventType = payload.event_type;

  switch (eventType) {
    case "payment_success": {
      const transaction = payload.data?.transaction;
      if (!transaction) throw new Error("Missing transaction in payment_success");

      // Card settlements (hosted checkout / tokenized-card charges) take a
      // completely separate path — branch BEFORE the untouched VA logic.
      if (isCardSettlement(payload)) {
        await handleCardSettlement(receipt, payload);
        break;
      }

      const aliasAccountReference = transaction.aliasAccountReference || "";
      const rawAmount = transaction.transactionAmount;
      const amountMinor = Math.round(Number(rawAmount) * 100);

      // 1. Gather context
      const virtualAccount = await prisma.virtualAccount.findUnique({
        where: { accountRef: aliasAccountReference },
      });

      // WALLET VA credit = a bank top-up → wallet ledger, not a contribution.
      if (virtualAccount && virtualAccount.kind === "WALLET") {
        await handleWalletBankTopup(receipt, payload, virtualAccount);
        break;
      }

      let membership = null;
      let circle = null;
      let cycle = null;
      let existingContribution = null;

      // WALLET-kind VAs (per-user top-up accounts) have no membership and are
      // NOT circle contributions — their credits route to the wallet ledger
      // (Stage 3). Until that lands, only CIRCLE VAs with a membership run the
      // contribution matcher; anything else is treated as an unknown VA below.
      const circleMembershipId =
        virtualAccount && virtualAccount.kind === "CIRCLE" ? virtualAccount.membershipId : null;

      if (virtualAccount && circleMembershipId) {
        membership = await prisma.membership.findUnique({
          where: { id: circleMembershipId },
        });

        if (membership) {
          circle = await prisma.circle.findUnique({
            where: { id: membership.circleId },
          });

          if (circle) {
            cycle = await prisma.cycle.findUnique({
              where: {
                circleId_sequence: {
                  circleId: circle.id,
                  sequence: circle.currentCycleSeq,
                },
              },
            });

            if (cycle) {
              existingContribution = await prisma.contribution.findUnique({
                where: {
                  cycleId_membershipId: {
                    cycleId: cycle.id,
                    membershipId: membership.id,
                  },
                },
              });
            }
          }
        }
      }

      const ctx: MatchContext = {
        // Narrowed to the matcher's shape; null for WALLET / membership-less VAs
        // (→ matcher returns UNKNOWN_VA and the credit is recorded, not misapplied).
        virtualAccount:
          virtualAccount && circleMembershipId
            ? {
                id: virtualAccount.id,
                accountRef: virtualAccount.accountRef,
                membershipId: circleMembershipId,
              }
            : null,
        membership,
        circle,
        cycle,
        existingContribution,
      };

      // 2. Run matcher
      const matchResult = matchInboundTransfer(amountMinor, aliasAccountReference, ctx);

      // 3. Handle UNKNOWN_VA
      if (matchResult.decision === "UNKNOWN_VA") {
        await prisma.webhookReceipt.update({
          where: { id: receipt.id },
          data: { processingError: "unknown aliasAccountReference" },
        });
        return; // Return normally so route.ts marks as processed and returns 200
      }

      // 4. DB Transaction — returns whether money was actually applied (false on
      // a duplicate webhook or an UNMATCHED credit) so we only alert on a real
      // contribution.
      const applied = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<boolean> => {
        // A. Create InboundTransfer
        try {
          await tx.inboundTransfer.create({
            data: {
              provider: "NOMBA",
              providerEventId: receipt.providerEventId,
              nombaTransactionId: transaction.transactionId || "",
              aliasAccountRef: aliasAccountReference,
              virtualAccountId: virtualAccount!.id,
              amountMinor,
              currency: transaction.currency || "NGN",
              senderName: transaction.senderName,
              senderBank: transaction.senderBank,
              senderBankCode: transaction.senderBankCode,
              senderAccountNumber: transaction.senderAccountNumber,
              narration: transaction.narration,
              matchStatus: matchResult.decision as "MATCHED" | "UNMATCHED" | "UNDERPAID" | "OVERPAID",
              matchedCycleId: matchResult.matchedCycleId,
              matchedMembershipId: matchResult.matchedMembershipId,
              receivedAt: new Date(transaction.time || Date.now()),
            },
          });
        } catch (err) {
          if ((err as { code?: string }).code === "P2002") {
            // Already applied, treat as success, do not re-increment pot
            return false;
          }
          throw err;
        }

        // B. Apply UNMATCHED gracefully (persist only InboundTransfer)
        if (matchResult.decision === "UNMATCHED") {
          return false;
        }

        // C/D/E. Apply the split (contribution + buffer + pot + status flip) —
        // shared with the card-settlement path so the money logic lives once.
        await applyContributionSplit(tx, matchResult);
        return true;
      });

      // Alert the member their bank-transfer contribution landed.
      if (applied && membership && circle) {
        await notifyContributionReceived({
          userId: membership.userId,
          amountMinor,
          circleName: circle.name,
          circleId: circle.id,
          cycleSequence: cycle?.sequence,
        });
      }

      break;
    }

    case "payment_failed": {
      // Only card-order failures are actionable here; VA transfers don't fail
      // this way. Non-card payment_failed events are a graceful no-op.
      if (isCardSettlement(payload)) {
        await handleCardFailure(payload);
      }
      break;
    }

    case "payout_success": {
      const ref = payload.data?.transaction?.merchantTxRef;
      if (!ref) throw new Error("payout_success missing merchantTxRef");

      // Wallet withdrawals settle here too — resolve them before the circle
      // Payout path (which assumes a payout_<cycleId> ref).
      if (isWalletWithdrawalRef(ref)) {
        await handleWalletWithdrawalSuccess(ref, payload.data?.transaction?.transactionId);
        break;
      }

      let payoutRecipientId: string | null = null;
      let amountMinor = 0;
      let feeMinor = 0;
      let payoutCircleName = "";

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const payout = await tx.payout.findUnique({
          where: { merchantTxRef: ref },
          include: {
            cycle: { include: { recipientMembership: true, circle: { select: { name: true } } } },
          },
        });
        if (!payout) return;
        if (payout.status === "SUCCESS") return;

        payoutRecipientId = payout.cycle.recipientMembership.userId;
        amountMinor = payout.amountMinor;
        feeMinor = payout.feeMinor;
        payoutCircleName = payout.cycle.circle.name;

        await tx.payout.update({
          where: { id: payout.id },
          data: { status: "SUCCESS", nombaStatus: "SUCCESS" },
        });

        await tx.cycle.update({
          where: { id: payout.cycleId },
          data: { status: "PAID_OUT", paidOutAt: new Date() },
        });

        await advanceRotation(tx, payout.cycle.circleId, payout.cycle);
      });

      if (payoutRecipientId) {
        await createNotification({
          userId: payoutRecipientId,
          type: "PAYOUT_RECEIVED",
          title: "You've been paid!",
          body: `Your circle payout of ${formatNaira(amountMinor)} has been successfully transferred to your bank account.`,
        });

        // Email the recipient too (best-effort; never fail the webhook on email).
        try {
          const recipient = await prisma.user.findUnique({
            where: { id: payoutRecipientId },
            select: { email: true },
          });
          if (recipient?.email) {
            await sendEmail({
              to: recipient.email,
              subject: "You've been paid — StashUp payout sent",
              react: PayoutReceivedEmail({
                amount: formatNaira(amountMinor),
                circleName: payoutCircleName,
                ...(feeMinor > 0
                  ? { fee: formatNaira(feeMinor), gross: formatNaira(amountMinor + feeMinor) }
                  : {}),
              }),
            });
          }
        } catch (err) {
          console.error("Failed to send payout email:", err instanceof Error ? err.message : err);
        }
      }
      break;
    }

    case "payout_failed": {
      const ref = payload.data?.transaction?.merchantTxRef;
      if (!ref) throw new Error("payout_failed missing merchantTxRef");

      const reason = payload.data?.transaction?.responseCode || payload.data?.transaction?.narration || "Unknown failure";

      // Wallet withdrawal failed → reverse the debit back to the wallet.
      if (isWalletWithdrawalRef(ref)) {
        await handleWalletWithdrawalFailed(ref, reason);
        break;
      }

      let payoutRecipientId: string | null = null;
      let amountMinor = 0;

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const payout = await tx.payout.findUnique({
          where: { merchantTxRef: ref },
          include: { cycle: { include: { recipientMembership: true } } },
        });
        if (!payout) return;
        if (payout.status === "FAILED") return;

        payoutRecipientId = payout.cycle.recipientMembership.userId;
        amountMinor = payout.amountMinor;

        await tx.payout.update({
          where: { id: payout.id },
          data: { status: "FAILED", failureReason: reason },
        });
        // Leave cycle at PAYOUT_INITIATED for admin retry (Sprint 8)
      });

      if (payoutRecipientId) {
        await createNotification({
          userId: payoutRecipientId,
          type: "GENERIC", // no PAYOUT_FAILED enum; GENERIC avoids mislabelling a failure as "sent"
          title: "Payout Failed",
          // Keep the raw provider reason in Payout.failureReason (admin-facing);
          // the user-facing body stays friendly and free of raw provider codes.
          body: `Your circle payout of ${formatNaira(amountMinor)} could not be completed. Our team is looking into it — please contact support if you need help.`,
        });
      }
      break;
    }

    case "payout_refund":
      console.log(`[Webhook] Graceful no-op for ${eventType} for receipt ${receipt.id}`);
      break;

    default:
      console.log(`[Webhook] Graceful no-op for unhandled event_type: ${eventType}`);
  }
}

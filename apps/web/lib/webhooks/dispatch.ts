import { prisma } from "@workspace/db";
import type { WebhookReceipt, Prisma } from "@workspace/db";
import { NombaWebhookPayload } from "./verify";
import { matchInboundTransfer, MatchContext } from "../reconciliation/match";
export async function dispatchWebhookEvent(
  receipt: WebhookReceipt,
  payload: NombaWebhookPayload
): Promise<void> {
  const eventType = payload.event_type;

  switch (eventType) {
    case "payment_success": {
      const transaction = payload.data?.transaction;
      if (!transaction) throw new Error("Missing transaction in payment_success");

      const aliasAccountReference = transaction.aliasAccountReference || "";
      const rawAmount = transaction.amount;
      const amountMinor = Math.round(Number(rawAmount) * 100);

      // 1. Gather context
      const virtualAccount = await prisma.virtualAccount.findUnique({
        where: { accountRef: aliasAccountReference },
      });

      let membership = null;
      let circle = null;
      let cycle = null;
      let existingContribution = null;

      if (virtualAccount) {
        membership = await prisma.membership.findUnique({
          where: { id: virtualAccount.membershipId },
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
        virtualAccount,
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

      // 4. DB Transaction
      await prisma.$transaction(async (tx) => {
        // A. Create InboundTransfer
        let inboundTransfer;
        try {
          inboundTransfer = await tx.inboundTransfer.create({
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
            return;
          }
          throw err;
        }

        // B. Apply UNMATCHED gracefully (persist only InboundTransfer)
        if (matchResult.decision === "UNMATCHED") {
          return;
        }

        // C. Upsert Contribution
        if (matchResult.matchedCycleId && matchResult.matchedMembershipId) {
          await tx.contribution.upsert({
            where: {
              cycleId_membershipId: {
                cycleId: matchResult.matchedCycleId,
                membershipId: matchResult.matchedMembershipId,
              },
            },
            update: {
              amountMinor: matchResult.newContributionAmount,
              status: matchResult.contributionStatus!,
            },
            create: {
              cycleId: matchResult.matchedCycleId,
              membershipId: matchResult.matchedMembershipId,
              amountMinor: matchResult.newContributionAmount,
              status: matchResult.contributionStatus!,
            },
          });

          // D. Update Buffer if OVERPAID
          if (matchResult.amountToBuffer > 0) {
            await tx.membership.update({
              where: { id: matchResult.matchedMembershipId },
              data: {
                bufferMinor: { increment: matchResult.amountToBuffer },
              },
            });
          }

          // E. Increment Pot and check Status Flip
          if (matchResult.amountAppliedToPot > 0) {
            const updatedCycle = await tx.cycle.update({
              where: { id: matchResult.matchedCycleId },
              data: {
                potCollectedMinor: { increment: matchResult.amountAppliedToPot },
              },
            });

            if (
              updatedCycle.potCollectedMinor >= updatedCycle.potExpectedMinor &&
              (updatedCycle.status === "OPEN" || updatedCycle.status === "COLLECTING")
            ) {
              await tx.cycle.update({
                where: { id: updatedCycle.id },
                data: { status: "READY_TO_PAYOUT" },
              });
            } else if (
              updatedCycle.status === "OPEN" &&
              updatedCycle.potCollectedMinor > 0
            ) {
              await tx.cycle.update({
                where: { id: updatedCycle.id },
                data: { status: "COLLECTING" },
              });
            }
          }
        }
      });

      break;
    }

    case "payout_success":
    case "payout_failed":
    case "payout_refund":
      // Sprint 5: Handle payout status updates gracefully
      console.log(`[Webhook] Graceful no-op for ${eventType} for receipt ${receipt.id}`);
      break;

    default:
      console.log(`[Webhook] Graceful no-op for unhandled event_type: ${eventType}`);
  }
}

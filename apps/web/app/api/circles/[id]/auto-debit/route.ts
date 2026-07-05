import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { requireCircleMember, requireVerifiedEmail } from "@/lib/access-control";
import { chargeTokenizedCard } from "@/lib/nomba-client";
import { grossUpForCardFee } from "@/lib/fees";
import {
  MAX_ATTEMPTS,
  computeRemainingDue,
  shouldCollectNow,
  chargeOrderRef,
  orderNonce,
} from "@/lib/cards/enrollment";
import { collectFromWallet } from "@/lib/wallet/waterfall";
import { LinkAutoDebitReqSchema, type LinkAutoDebitRes } from "@/app/api/cards/dto/cards.dto";

/**
 * POST /api/circles/[id]/auto-debit — bind one of the user's saved cards to
 * THIS circle. If the current cycle is OPEN/COLLECTING and the member still
 * owes, immediately charge the remainder (snappy UX); otherwise the Stage 4
 * sweep collects on schedule. Binding always succeeds even if the immediate
 * charge call fails — the sweep retries.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id: circleId } = await params;
  const userId = session.user.id;

  let membership;
  try {
    requireVerifiedEmail(session.user);
    membership = await requireCircleMember(circleId, userId);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = LinkAutoDebitReqSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("A saved card is required", 422);
  }

  const card = await prisma.savedCard.findUnique({
    where: { id: parsed.data.savedCardId },
    select: { id: true, userId: true, status: true, tokenKey: true },
  });
  if (!card || card.userId !== userId) {
    return apiError("Card not found", 404);
  }
  if (card.status !== "ACTIVE") {
    return apiError("That card is no longer usable. Add a new card.", 409);
  }

  await prisma.membership.update({
    where: { id: membership.id },
    data: { autoDebitCardId: card.id },
  });

  // Immediate collection if the member currently owes on an open cycle.
  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    select: { contributionMinor: true, currentCycleSeq: true },
  });
  if (!circle) return apiError("Circle not found", 404);

  const currentCycle = await prisma.cycle.findUnique({
    where: { circleId_sequence: { circleId, sequence: circle.currentCycleSeq || 1 } },
    select: {
      id: true,
      status: true,
      contributions: {
        where: { membershipId: membership.id },
        select: { amountMinor: true },
      },
    },
  });

  let chargeInitiated = false;
  if (currentCycle) {
    const alreadyPaid = currentCycle.contributions[0]?.amountMinor ?? 0;
    let remainingDue = computeRemainingDue(circle.contributionMinor, alreadyPaid);

    // Wallet first (opt-in) — the same waterfall the sweep uses. A wallet that
    // covers the whole contribution means no card charge at all.
    if (membership.autoDebitWallet && shouldCollectNow(currentCycle.status, remainingDue)) {
      try {
        const res = await collectFromWallet({
          userId,
          membershipId: membership.id,
          cycleId: currentCycle.id,
          contributionMinor: circle.contributionMinor,
        });
        remainingDue = res.remainingDueMinor;
      } catch (err) {
        console.error(
          "[auto-debit] wallet collect failed (card will cover it):",
          err instanceof Error ? err.message : err
        );
      }
    }

    // Never double-charge while an attempt is already in flight for this cycle.
    const pending = await prisma.chargeAttempt.findFirst({
      where: { cycleId: currentCycle.id, membershipId: membership.id, status: "PENDING" },
      select: { id: true },
    });

    if (!pending && shouldCollectNow(currentCycle.status, remainingDue)) {
      const last = await prisma.chargeAttempt.findFirst({
        where: { cycleId: currentCycle.id, membershipId: membership.id, attemptNumber: { gte: 1 } },
        orderBy: { attemptNumber: "desc" },
        select: { attemptNumber: true },
      });
      const attemptNumber = (last?.attemptNumber ?? 0) + 1;

      if (attemptNumber <= MAX_ATTEMPTS) {
        const orderReference = chargeOrderRef(orderNonce());
        // Gross up so the NET (after Nomba's card fee) covers the contribution.
        const chargeMinor = grossUpForCardFee(remainingDue);
        const attempt = await prisma.chargeAttempt.create({
          data: {
            cycleId: currentCycle.id,
            membershipId: membership.id,
            userId,
            savedCardId: card.id,
            purpose: "CONTRIBUTION",
            amountMinor: chargeMinor,
            orderReference,
            attemptNumber,
            status: "PENDING",
          },
        });

        try {
          const charge = await chargeTokenizedCard({
            orderReference,
            customerEmail: session.user.email,
            amountMinor: chargeMinor,
            tokenKey: card.tokenKey,
            metadata: {
              kind: "cardchg",
              userId,
              membershipId: membership.id,
              cycleId: currentCycle.id,
              attemptId: attempt.id,
            },
          });
          if (charge.otpRequired) {
            // 3DS/OTP-gated: this bind-time auto-charge can't complete an OTP.
            // Fail it (not left PENDING) so the member can pay via "Pay now",
            // which drives the OTP step interactively.
            await prisma.chargeAttempt.update({
              where: { id: attempt.id },
              data: { status: "FAILED", failureReason: "otp_required" },
            });
          } else {
            chargeInitiated = true;
          }
        } catch (err) {
          console.error(
            "[auto-debit] immediate charge failed (sweep will retry):",
            err instanceof Error ? err.message : err
          );
          await prisma.chargeAttempt.update({
            where: { id: attempt.id },
            data: { status: "FAILED", failureReason: "charge_request_failed" },
          });
        }
      }
    }
  }

  return apiSuccess<LinkAutoDebitRes>({ autoDebitCardId: card.id, chargeInitiated });
}

/** DELETE /api/circles/[id]/auto-debit — turn off auto-save for THIS circle
 * only. Other circles' bindings to the same card are untouched. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id: circleId } = await params;

  let membership;
  try {
    membership = await requireCircleMember(circleId, session.user.id);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  await prisma.membership.update({
    where: { id: membership.id },
    data: { autoDebitCardId: null },
  });

  return apiSuccess({ success: true });
}

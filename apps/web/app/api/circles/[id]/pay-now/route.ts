import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { requireCircleMember, requireVerifiedEmail } from "@/lib/access-control";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
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
import { PayNowReqSchema, type PayNowRes } from "./dto/pay-now.dto";

/**
 * Pay the current cycle's amount due on demand — the missing "I want to pay
 * early" path (bank transfer is manual, auto-save is recurring). Explicit
 * method: WALLET debits the balance instantly (internal ledger move); CARD
 * charges a saved card (settles via the webhook, same as the auto-debit sweep).
 * Never binds auto-save — this is a one-off payment.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return apiError("Unauthorized", 401);

  const { id: circleId } = await params;
  const userId = session.user.id;

  let membership;
  try {
    requireVerifiedEmail(session.user);
    membership = await requireCircleMember(circleId, userId);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  const parsed = PayNowReqSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("Choose a payment method", 422);

  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    select: { contributionMinor: true, currentCycleSeq: true, status: true },
  });
  if (!circle) return apiError("Circle not found", 404);
  if (circle.status !== "ACTIVE") return apiError("This circle isn't collecting right now", 409);

  const currentCycle = await prisma.cycle.findUnique({
    where: { circleId_sequence: { circleId, sequence: circle.currentCycleSeq || 1 } },
    select: {
      id: true,
      status: true,
      contributions: { where: { membershipId: membership.id }, select: { amountMinor: true } },
    },
  });
  if (!currentCycle) return apiError("No open cycle to pay", 409);

  const alreadyPaid = currentCycle.contributions[0]?.amountMinor ?? 0;
  const remainingDue = computeRemainingDue(circle.contributionMinor, alreadyPaid);
  if (!shouldCollectNow(currentCycle.status, remainingDue)) {
    return apiError("You're already paid up for this cycle", 409);
  }

  // ── WALLET: instant internal debit ──
  if (parsed.data.method === "WALLET") {
    const res = await collectFromWallet({
      userId,
      membershipId: membership.id,
      cycleId: currentCycle.id,
      contributionMinor: circle.contributionMinor,
    });
    if (res.debitedMinor <= 0) {
      return apiError("Your wallet balance is empty — top up or pay by card", 400);
    }
    return apiSuccess<PayNowRes>({
      method: "WALLET",
      status: "APPLIED",
      debitedMinor: res.debitedMinor,
      remainingDueMinor: res.remainingDueMinor,
    });
  }

  // ── CARD: charge a saved card (settles via webhook) ──
  if (await isNombaIntegrationDisabled()) {
    return apiError("Card payments are temporarily unavailable", 503);
  }

  const card = await prisma.savedCard.findUnique({
    where: { id: parsed.data.savedCardId },
    select: { id: true, userId: true, status: true, tokenKey: true },
  });
  if (!card || card.userId !== userId) return apiError("Card not found", 404);
  if (card.status !== "ACTIVE") return apiError("That card is no longer usable. Add a new card.", 409);

  // Never double-charge while an attempt is already in flight for this cycle.
  const pending = await prisma.chargeAttempt.findFirst({
    where: { cycleId: currentCycle.id, membershipId: membership.id, status: "PENDING" },
    select: { id: true },
  });
  if (pending) return apiError("A card payment is already processing for this cycle", 409);

  const last = await prisma.chargeAttempt.findFirst({
    where: { cycleId: currentCycle.id, membershipId: membership.id, attemptNumber: { gte: 1 } },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true },
  });
  const attemptNumber = (last?.attemptNumber ?? 0) + 1;
  if (attemptNumber > MAX_ATTEMPTS) {
    return apiError("Too many card attempts for this cycle. Try a bank transfer.", 409);
  }

  const orderReference = chargeOrderRef(orderNonce());
  const chargeMinor = grossUpForCardFee(remainingDue); // NET after fee covers the due
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
    await chargeTokenizedCard({
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
  } catch (err) {
    console.error(
      "[pay-now] card charge failed:",
      err instanceof Error ? err.message : err
    );
    await prisma.chargeAttempt.update({
      where: { id: attempt.id },
      data: { status: "FAILED", failureReason: "charge_request_failed" },
    });
    return apiError("Could not charge that card. Please try again.", 502);
  }

  return apiSuccess<PayNowRes>({
    method: "CARD",
    status: "CHARGING",
    debitedMinor: 0,
    remainingDueMinor: remainingDue,
  });
}

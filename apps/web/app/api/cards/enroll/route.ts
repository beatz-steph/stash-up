import { randomUUID } from "node:crypto";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { requireCircleMember, requireVerifiedEmail } from "@/lib/access-control";
import { createCheckoutOrder } from "@/lib/nomba-client";
import { grossUpForCardFee } from "@/lib/fees";
import {
  VERIFICATION_AMOUNT_MINOR,
  computeRemainingDue,
  shouldCollectNow,
  enrollOrderRef,
  verifyOrderRef,
  checkoutCallbackUrl,
  enrollMetadata,
} from "@/lib/cards/enrollment";
import { EnrollCardReqSchema, type EnrollCardRes } from "../dto/cards.dto";

/**
 * Add a NEW card via a tokenizing checkout. Two paths:
 *  - Path B (circleId present): if the current cycle is OPEN/COLLECTING and the
 *    member still owes, the enrollment charge IS the contribution; otherwise a
 *    ₦50 refundable verification charge (card still bound to this circle on
 *    settlement).
 *  - Path C (no circleId, from Settings): always a ₦50 verification charge,
 *    bound to no circle.
 * The SavedCard is created and bound on webhook settlement (Stage 3).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = EnrollCardReqSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiError("Invalid request body", 422);
  }
  const { circleId } = parsed.data;
  const userId = session.user.id;
  const customerEmail = session.user.email;

  try {
    requireVerifiedEmail(session.user);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  // ── Path B: adding a card from a circle ──────────────────────────────────
  if (circleId) {
    let membership;
    try {
      membership = await requireCircleMember(circleId, userId);
    } catch (err) {
      return apiError(err instanceof Error ? err.message : "Forbidden", 403);
    }

    const circle = await prisma.circle.findUnique({
      where: { id: circleId },
      select: { id: true, contributionMinor: true, currentCycleSeq: true },
    });
    if (!circle) return apiError("Circle not found", 404);

    const currentCycle = await prisma.cycle.findUnique({
      where: {
        circleId_sequence: { circleId: circle.id, sequence: circle.currentCycleSeq || 1 },
      },
      select: {
        id: true,
        status: true,
        contributions: {
          where: { membershipId: membership.id },
          select: { amountMinor: true },
        },
      },
    });

    const alreadyPaid = currentCycle?.contributions[0]?.amountMinor ?? 0;
    const remainingDue = computeRemainingDue(circle.contributionMinor, alreadyPaid);
    const contributionMode =
      !!currentCycle && shouldCollectNow(currentCycle.status, remainingDue);

    const nonce = randomUUID();
    // Contribution charges are grossed-up so the NET (after Nomba's card fee)
    // covers the full contribution — the member pays the surfaced fee, the pot
    // still receives the whole amount. Verification stays a flat ₦50 hold.
    const amountMinor = contributionMode
      ? grossUpForCardFee(remainingDue)
      : VERIFICATION_AMOUNT_MINOR;
    const orderReference = contributionMode
      ? enrollOrderRef(currentCycle!.id, membership.id, nonce)
      : verifyOrderRef(userId, nonce);

    // One attempt row per (cycle, membership) enrollment — upsert so an
    // abandoned checkout retry reuses the slot with a fresh orderReference.
    const attempt = currentCycle
      ? await prisma.chargeAttempt.upsert({
          where: {
            cycleId_membershipId_attemptNumber: {
              cycleId: currentCycle.id,
              membershipId: membership.id,
              attemptNumber: 0,
            },
          },
          create: {
            cycleId: currentCycle.id,
            membershipId: membership.id,
            userId,
            purpose: contributionMode ? "ENROLLMENT" : "VERIFICATION",
            amountMinor,
            orderReference,
            attemptNumber: 0,
            status: "PENDING",
          },
          update: {
            purpose: contributionMode ? "ENROLLMENT" : "VERIFICATION",
            amountMinor,
            orderReference,
            status: "PENDING",
            failureReason: null,
            nombaTransactionId: null,
            settledAt: null,
            refundStatus: "NOT_APPLICABLE",
            refundedAt: null,
          },
        })
      : // No cycle row at all (shouldn't happen for an active circle) — record a
        // membership-scoped verification attempt without a cycle.
        await prisma.chargeAttempt.create({
          data: {
            membershipId: membership.id,
            userId,
            purpose: "VERIFICATION",
            amountMinor,
            orderReference,
            attemptNumber: 0,
            status: "PENDING",
          },
        });

    let order;
    try {
      order = await createCheckoutOrder({
        orderReference,
        customerEmail,
        amountMinor,
        callbackUrl: checkoutCallbackUrl(circleId),
        tokenizeCard: true,
        metadata: enrollMetadata({
          kind: contributionMode ? "cardenroll" : "cardverify",
          userId,
          membershipId: membership.id,
          cycleId: currentCycle?.id,
          attemptId: attempt.id,
        }),
      });
    } catch (err) {
      console.error("[cards/enroll] checkout order failed:", err instanceof Error ? err.message : err);
      return apiError("Could not start card checkout. Please try again.", 502);
    }

    return apiSuccess<EnrollCardRes>({
      checkoutLink: order.checkoutLink,
      orderReference,
      mode: contributionMode ? "contribution" : "verification",
      amountMinor,
    });
  }

  // ── Path C: adding a card from Settings (no circle context) ──────────────
  const nonce = randomUUID();
  const orderReference = verifyOrderRef(userId, nonce);
  const attempt = await prisma.chargeAttempt.create({
    data: {
      userId,
      purpose: "VERIFICATION",
      amountMinor: VERIFICATION_AMOUNT_MINOR,
      orderReference,
      attemptNumber: 0,
      status: "PENDING",
    },
  });

  let order;
  try {
    order = await createCheckoutOrder({
      orderReference,
      customerEmail,
      amountMinor: VERIFICATION_AMOUNT_MINOR,
      callbackUrl: checkoutCallbackUrl(),
      tokenizeCard: true,
      metadata: enrollMetadata({ kind: "cardverify", userId, attemptId: attempt.id }),
    });
  } catch (err) {
    console.error("[cards/enroll] checkout order failed:", err instanceof Error ? err.message : err);
    return apiError("Could not start card checkout. Please try again.", 502);
  }

  return apiSuccess<EnrollCardRes>({
    checkoutLink: order.checkoutLink,
    orderReference,
    mode: "verification",
    amountMinor: VERIFICATION_AMOUNT_MINOR,
  });
}

import { prisma } from "@workspace/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import {
  chargeTokenizedCard,
  verifyCheckoutTransaction,
  refundCheckoutTransaction,
} from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import {
  computeRemainingDue,
  shouldCollectNow,
  computeNextAttempt,
  chargeOrderRef,
} from "@/lib/cards/enrollment";

const VERIFY_STALE_MINUTES = 30;
const MAX_REFUND_RETRIES = 3;

/**
 * Card debit sweep — the collection engine for auto-save. Triggered on an
 * interval by an external scheduler (Railway) with the CRON_SECRET bearer.
 *
 * Three passes, each per-item try/catch so one failure never aborts the sweep:
 *  1. CHARGE — for every membership with an ACTIVE bound card on an OPEN/
 *     COLLECTING cycle, charge the LIVE remainingDue (THE CORE RULE). Never
 *     while a PENDING attempt exists; capped at MAX_ATTEMPTS with 24h/72h
 *     backoff.
 *  2. VERIFY BACKSTOP — for PENDING attempts older than 30 min, verify at
 *     Nomba: capture the txn id on success (webhook finishes settlement) or
 *     mark FAILED on a definitive non-success (frees the next retry).
 *  3. REFUND RETRY — retry verification refunds stuck at FAILED, giving up
 *     (and logging) after MAX_REFUND_RETRIES.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return apiError("Unauthorized", 401);
  }

  if (await isNombaIntegrationDisabled()) {
    return apiError("Nomba integration is disabled", 503);
  }

  const now = Date.now();
  const summary = {
    charged: 0,
    chargeSkipped: 0,
    chargeFailed: 0,
    verifyCaptured: 0,
    verifyFailed: 0,
    refundsRetried: 0,
    refundsExhausted: 0,
    errors: [] as string[],
  };

  // ── Pass 1: CHARGE ─────────────────────────────────────────────────────────
  const memberships = await prisma.membership.findMany({
    where: { autoDebitCardId: { not: null }, autoDebitCard: { status: "ACTIVE" } },
    select: {
      id: true,
      circleId: true,
      autoDebitCard: { select: { id: true, tokenKey: true, status: true } },
      circle: {
        select: { id: true, status: true, contributionMinor: true, currentCycleSeq: true },
      },
      user: { select: { id: true, email: true } },
    },
  });

  for (const m of memberships) {
    try {
      const card = m.autoDebitCard;
      if (!card || card.status !== "ACTIVE" || m.circle.status !== "ACTIVE") {
        summary.chargeSkipped++;
        continue;
      }

      const cycle = await prisma.cycle.findUnique({
        where: {
          circleId_sequence: { circleId: m.circleId, sequence: m.circle.currentCycleSeq },
        },
        select: { id: true, status: true },
      });
      if (!cycle) {
        summary.chargeSkipped++;
        continue;
      }

      const contribution = await prisma.contribution.findUnique({
        where: { cycleId_membershipId: { cycleId: cycle.id, membershipId: m.id } },
        select: { amountMinor: true },
      });
      const remainingDue = computeRemainingDue(
        m.circle.contributionMinor,
        contribution?.amountMinor ?? 0
      );

      // THE CORE RULE: paid up (remainingDue 0) or non-collectible cycle → nothing.
      if (!shouldCollectNow(cycle.status, remainingDue)) {
        summary.chargeSkipped++;
        continue;
      }

      const priors = await prisma.chargeAttempt.findMany({
        where: { cycleId: cycle.id, membershipId: m.id, attemptNumber: { gte: 1 } },
        select: { attemptNumber: true, status: true, createdAt: true },
      });
      const { eligible, attemptNumber } = computeNextAttempt(priors, now);
      if (!eligible) {
        summary.chargeSkipped++;
        continue;
      }

      const orderReference = chargeOrderRef(cycle.id, m.id, attemptNumber);
      const attempt = await prisma.chargeAttempt.create({
        data: {
          cycleId: cycle.id,
          membershipId: m.id,
          userId: m.user.id,
          savedCardId: card.id,
          purpose: "CONTRIBUTION",
          amountMinor: remainingDue,
          orderReference,
          attemptNumber,
          status: "PENDING",
        },
      });

      try {
        await chargeTokenizedCard({
          orderReference,
          customerEmail: m.user.email,
          amountMinor: remainingDue,
          tokenKey: card.tokenKey,
          metadata: {
            kind: "cardchg",
            userId: m.user.id,
            membershipId: m.id,
            cycleId: cycle.id,
            attemptId: attempt.id,
          },
        });
        summary.charged++;
      } catch (err) {
        console.error(
          `[card-sweep] charge failed membership=${m.id}:`,
          err instanceof Error ? err.message : err
        );
        await prisma.chargeAttempt.update({
          where: { id: attempt.id },
          data: { status: "FAILED", failureReason: "charge_request_failed" },
        });
        summary.chargeFailed++;
      }
    } catch (err) {
      summary.errors.push(m.id);
      console.error(
        `[card-sweep] membership ${m.id} error:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // ── Pass 2: VERIFY BACKSTOP ────────────────────────────────────────────────
  const staleBefore = new Date(now - VERIFY_STALE_MINUTES * 60 * 1000);
  const stalePending = await prisma.chargeAttempt.findMany({
    where: { status: "PENDING", createdAt: { lt: staleBefore } },
    select: { id: true, orderReference: true },
  });

  for (const a of stalePending) {
    try {
      const res = await verifyCheckoutTransaction(a.orderReference);
      if (res.settled) {
        // Capture the txn id; leave PENDING so the (retrying) webhook completes
        // card creation + the pot application with the tokenKey it carries.
        if (res.transactionId) {
          await prisma.chargeAttempt.update({
            where: { id: a.id },
            data: { nombaTransactionId: res.transactionId },
          });
        }
        summary.verifyCaptured++;
      } else if (res.status && !/pending|processing/i.test(res.status)) {
        // Definitive non-success → FAILED so the next retry is unblocked.
        await prisma.chargeAttempt.update({
          where: { id: a.id },
          data: { status: "FAILED", failureReason: `verify_${res.status.toLowerCase()}` },
        });
        summary.verifyFailed++;
      }
    } catch (err) {
      summary.errors.push(`verify_${a.id}`);
      console.error(
        `[card-sweep] verify ${a.id} error:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // ── Pass 3: REFUND RETRY ───────────────────────────────────────────────────
  const failedRefunds = await prisma.chargeAttempt.findMany({
    where: {
      refundStatus: "FAILED",
      nombaTransactionId: { not: null },
      refundRetryCount: { lt: MAX_REFUND_RETRIES },
    },
    select: { id: true, nombaTransactionId: true, amountMinor: true, refundRetryCount: true },
  });

  for (const a of failedRefunds) {
    try {
      await refundCheckoutTransaction({
        transactionId: a.nombaTransactionId!,
        amountMinor: a.amountMinor,
      });
      await prisma.chargeAttempt.update({
        where: { id: a.id },
        data: { refundStatus: "REFUNDED", refundedAt: new Date() },
      });
      summary.refundsRetried++;
    } catch {
      const next = a.refundRetryCount + 1;
      await prisma.chargeAttempt.update({
        where: { id: a.id },
        data: { refundRetryCount: next },
      });
      if (next >= MAX_REFUND_RETRIES) {
        summary.refundsExhausted++;
        console.error(
          `[card-sweep] refund permanently failed (manual follow-up) attempt=${a.id}`
        );
      }
    }
  }

  return apiSuccess(summary);
}

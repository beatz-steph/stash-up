import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Card auto-debit shared logic. Kept side-effect free (no Prisma/Nomba here)
 * so THE CORE COLLECTION RULE can be unit-tested in isolation. Route handlers
 * import these; the debit-sweep cron (Stage 4) reuses the same predicate.
 */

/** ₦50 verification hold — charged then refunded when a card is added with no
 * contribution to collect. Never applied to any pot/contribution/buffer. */
export const VERIFICATION_AMOUNT_MINOR = 5000;

/**
 * A usable Nomba card token. When tokenization doesn't actually happen (card/
 * rail unsupported, checkout not completed as a tokenizing payment, sandbox),
 * Nomba still fires `payment_success` but with a PLACEHOLDER `tokenKey` like
 * `"N/A"`. Saving/charging that placeholder is what produces "success" with no
 * debit + an OTP email — a placeholder is not a real merchant-initiated token.
 * Reject those so we never persist or charge a card that can't actually be
 * charged offline.
 */
export function isUsableCardToken(tokenKey: string | null | undefined): tokenKey is string {
  if (!tokenKey) return false;
  const t = tokenKey.trim();
  if (t.length < 6) return false;
  return !["n/a", "null", "nil", "none", "undefined", "-"].includes(t.toLowerCase());
}

/** Max charge attempts per (cycle, membership) before we stop retrying. */
export const MAX_ATTEMPTS = 3;

/** Cycle statuses during which a card contribution may be collected. */
export const COLLECTIBLE_CYCLE_STATUSES = ["OPEN", "COLLECTING"] as const;
export type CollectibleCycleStatus = (typeof COLLECTIBLE_CYCLE_STATUSES)[number];

/**
 * THE CORE COLLECTION RULE. Every charge is computed from the member's LIVE
 * remaining balance at attempt time — never a previously-planned amount.
 *
 *   remainingDue = contributionMinor − (this cycle's Contribution.amountMinor)
 *
 * Buffer credit is already applied when a cycle opens (applyBuffersToNewCycle),
 * so the running contribution total is net of carried-over credit — do NOT
 * subtract bufferMinor again. Never returns negative (an over-collected member
 * owes nothing).
 */
export function computeRemainingDue(
  contributionMinor: number,
  currentContributionMinor: number
): number {
  return Math.max(0, contributionMinor - currentContributionMinor);
}

/** Is this cycle in a state where a card contribution can be collected? */
export function isCollectibleStatus(status: string): status is CollectibleCycleStatus {
  return (COLLECTIBLE_CYCLE_STATUSES as readonly string[]).includes(status);
}

/**
 * A card contribution should be collected right now iff the cycle is
 * collectible AND the member still owes something. Used by the link-existing
 * path (immediate snappy charge) and the sweep (Stage 4).
 */
export function shouldCollectNow(cycleStatus: string, remainingDue: number): boolean {
  return isCollectibleStatus(cycleStatus) && remainingDue > 0;
}

// ─── orderReference builders (also parsed as a fallback in the webhook) ───────
// Prefix-tagged so the settlement handler can route by prefix when
// orderMetaData is absent. A short nonce keeps each checkout globally unique.
// Nomba caps orderReference at 50 chars, so we CANNOT embed cuid ids here —
// the cycle/membership/attempt live in orderMetaData + the ChargeAttempt row,
// which is how the webhook actually routes (this reference is only a fallback
// key + the verify-backstop lookup handle). Max length: 11 + 32 = 43.

/** Compact unique token for an orderReference (32 hex chars, no dashes). */
export function orderNonce(): string {
  return randomUUID().replace(/-/g, "");
}

export function enrollOrderRef(nonce: string): string {
  return `cardenroll_${nonce}`;
}

export function verifyOrderRef(nonce: string): string {
  return `cardverify_${nonce}`;
}

export function chargeOrderRef(nonce: string): string {
  return `cardchg_${nonce}`;
}

/** Backoff before retry N (hours): attempt 2 waits 24h after attempt 1 failed,
 * attempt 3 waits 72h after attempt 2 failed. Attempt 1 has no wait. */
export function retryBackoffHours(attemptNumber: number): number {
  if (attemptNumber <= 1) return 0;
  if (attemptNumber === 2) return 24;
  return 72;
}

export interface PriorAttempt {
  attemptNumber: number;
  status: string; // ChargeAttemptStatus
  createdAt: Date;
}

/**
 * Decide whether a new sweep charge attempt may be created for a (cycle,
 * membership), and which attemptNumber it would be — given the prior charge
 * attempts (attemptNumber ≥ 1). Enforces: never while one is PENDING, cap at
 * MAX_ATTEMPTS, and the retry backoff window measured from the previous
 * attempt's createdAt. Pure — the sweep supplies remainingDue/card/cycle
 * checks separately.
 */
export function computeNextAttempt(
  priors: PriorAttempt[],
  now: number
): { eligible: boolean; attemptNumber: number } {
  const charges = priors.filter((a) => a.attemptNumber >= 1);

  // Never double-charge while an attempt is in flight.
  if (charges.some((a) => a.status === "PENDING")) {
    return { eligible: false, attemptNumber: 0 };
  }

  const maxNum = charges.reduce((m, a) => Math.max(m, a.attemptNumber), 0);
  const attemptNumber = maxNum + 1;
  if (attemptNumber > MAX_ATTEMPTS) {
    return { eligible: false, attemptNumber };
  }
  if (attemptNumber === 1) {
    return { eligible: true, attemptNumber };
  }

  const last = charges.find((a) => a.attemptNumber === maxNum);
  const backoffMs = retryBackoffHours(attemptNumber) * 60 * 60 * 1000;
  const eligible = !!last && now - last.createdAt.getTime() >= backoffMs;
  return { eligible, attemptNumber };
}

/** Absolute callback URL Nomba redirects the member back to after checkout. */
export function checkoutCallbackUrl(circleId?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stashup.xyz";
  return circleId ? `${base}/circles/${circleId}?card=added` : `${base}/settings?card=added`;
}

/** Wallet top-ups come back to the homepage — that's where the wallet lives. */
export function walletTopupCallbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stashup.xyz";
  return `${base}/?topup=pending`;
}

/** Webhook-routing metadata echoed back by Nomba in orderMetaData. No PII. */
export function enrollMetadata(params: {
  kind: "cardenroll" | "cardverify";
  userId: string;
  membershipId?: string;
  cycleId?: string;
  attemptId: string;
}): Record<string, string> {
  const meta: Record<string, string> = {
    kind: params.kind,
    userId: params.userId,
    attemptId: params.attemptId,
  };
  if (params.membershipId) meta.membershipId = params.membershipId;
  if (params.cycleId) meta.cycleId = params.cycleId;
  return meta;
}

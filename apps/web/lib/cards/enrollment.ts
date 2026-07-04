import "server-only";

/**
 * Card auto-debit shared logic. Kept side-effect free (no Prisma/Nomba here)
 * so THE CORE COLLECTION RULE can be unit-tested in isolation. Route handlers
 * import these; the debit-sweep cron (Stage 4) reuses the same predicate.
 */

/** ₦50 verification hold — charged then refunded when a card is added with no
 * contribution to collect. Never applied to any pot/contribution/buffer. */
export const VERIFICATION_AMOUNT_MINOR = 5000;

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
// orderMetaData is absent. A nonce keeps each checkout globally unique — an
// abandoned checkout can be retried without a duplicate-orderReference reject
// from Nomba (routing still keys off the stable prefix + orderMetaData.kind).

export function enrollOrderRef(cycleId: string, membershipId: string, nonce: string): string {
  return `cardenroll_${cycleId}_${membershipId}_${nonce}`;
}

export function verifyOrderRef(userId: string, nonce: string): string {
  return `cardverify_${userId}_${nonce}`;
}

export function chargeOrderRef(
  cycleId: string,
  membershipId: string,
  attemptNumber: number
): string {
  return `cardchg_${cycleId}_${membershipId}_a${attemptNumber}`;
}

/** Absolute callback URL Nomba redirects the member back to after checkout. */
export function checkoutCallbackUrl(circleId?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stashup.xyz";
  return circleId ? `${base}/circles/${circleId}?card=added` : `${base}/settings?card=added`;
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

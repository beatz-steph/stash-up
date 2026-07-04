/**
 * Fee policy — the business absorbs NOTHING; every fee is surfaced to the user.
 * Pure functions (safe to reuse for pre-checkout display), but the authoritative
 * amounts always come from the API. All money is kobo (Int).
 */

/**
 * Nomba card processing fee rate. Observed 1.4% on a live ₦50 settlement
 * (transaction.fee = ₦0.70) on 2026-07-04. Overridable via env so a corrected
 * real rate ships without a deploy.
 */
export const CARD_FEE_RATE = Number(
  process.env.NEXT_PUBLIC_NOMBA_CARD_FEE_RATE ?? process.env.NOMBA_CARD_FEE_RATE ?? "0.014"
);

// Nomba bank-transfer (payout) fee — tiered flat kobo amounts. Defaults follow
// typical Nigerian PSP tiers; override via env once confirmed with Nomba.
const TRANSFER_FEE_TIER1 = Number(process.env.NOMBA_TRANSFER_FEE_TIER1 ?? "1000"); // ≤ ₦5,000  → ₦10
const TRANSFER_FEE_TIER2 = Number(process.env.NOMBA_TRANSFER_FEE_TIER2 ?? "2500"); // ≤ ₦50,000 → ₦25
const TRANSFER_FEE_TIER3 = Number(process.env.NOMBA_TRANSFER_FEE_TIER3 ?? "5000"); // > ₦50,000 → ₦50
const TRANSFER_TIER1_MAX = 500_000; // ₦5,000 in kobo
const TRANSFER_TIER2_MAX = 5_000_000; // ₦50,000 in kobo

/** Flat bank-transfer fee (kobo) for a payout/withdrawal of `amountMinor`. */
export function transferFeeMinor(amountMinor: number): number {
  if (amountMinor <= TRANSFER_TIER1_MAX) return TRANSFER_FEE_TIER1;
  if (amountMinor <= TRANSFER_TIER2_MAX) return TRANSFER_FEE_TIER2;
  return TRANSFER_FEE_TIER3;
}

/**
 * Amount to charge a card so that, after Nomba's fee is deducted, at least
 * `netMinor` lands in the sub-account: gross = ceil(net / (1 − rate)). Integer
 * kobo. Used so the pot/wallet still receives the full intended contribution.
 */
export function grossUpForCardFee(netMinor: number): number {
  if (netMinor <= 0) return netMinor;
  return Math.ceil(netMinor / (1 - CARD_FEE_RATE));
}

/** The card fee portion (kobo) added on top of `netMinor` — for UI display. */
export function cardFeeOn(netMinor: number): number {
  return grossUpForCardFee(netMinor) - netMinor;
}

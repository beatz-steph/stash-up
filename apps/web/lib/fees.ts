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

// Nomba bank-transfer (payout) fee — flat ₦20. Overridable via env.
const TRANSFER_FEE = Number(process.env.NOMBA_TRANSFER_FEE ?? "2000"); // ₦20

/** Flat bank-transfer fee (kobo) for a payout/withdrawal. */
export function transferFeeMinor(amountMinor: number): number {
  return TRANSFER_FEE;
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

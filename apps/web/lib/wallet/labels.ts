/**
 * Human labels for wallet ledger sources. Pure + shared: the transactions feed
 * (server) sets these onto each wallet item, and the UI renders them directly.
 */
export const WALLET_SOURCE_LABEL: Record<string, string> = {
  TOPUP_BANK: "Bank top-up",
  TOPUP_CARD: "Card top-up",
  BUFFER_SWEEP: "Circle credit returned",
  REFUND_CREDIT: "Card verification credit",
  CIRCLE_DEBIT: "Circle contribution",
  WITHDRAWAL: "Withdrawal",
  REVERSAL: "Withdrawal reversed",
  ADJUSTMENT: "Adjustment",
}

export function walletSourceLabel(source: string): string {
  return WALLET_SOURCE_LABEL[source] ?? source
}

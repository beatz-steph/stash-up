import "server-only"

// Human-recognisable strings sent to Nomba. Nomba's virtual-account endpoint
// rejects punctuation in account names, so keep these to letters, digits and
// single spaces.

/** Strip characters providers reject; keep letters, digits and single spaces. */
function sanitize(input: string): string {
  return input
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Virtual-account holder name a member sees when funding — circle-based. */
export function vaAccountName(circleName: string): string {
  return sanitize(`StashUp ${circleName}`).slice(0, 60).trim()
}

/** Holder name for a user's personal wallet top-up virtual account. */
export function walletAccountName(userName: string): string {
  return sanitize(`StashUp Wallet ${userName}`).slice(0, 60).trim()
}

/** Narration on the outbound payout transfer. */
export function payoutNarration(circleName: string, cycleSequence: number): string {
  return sanitize(`StashUp payout ${circleName} cycle ${cycleSequence}`).slice(0, 100).trim()
}

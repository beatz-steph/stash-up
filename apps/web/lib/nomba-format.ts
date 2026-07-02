import "server-only"

// Human-recognisable strings sent to Nomba. Kept short and free of special
// characters (some providers reject punctuation / long names).

/** Virtual-account holder name a member sees when funding — circle-based. */
export function vaAccountName(circleName: string): string {
  return `StashUp - ${circleName}`.slice(0, 100).trim()
}

/** Narration on the outbound payout transfer. */
export function payoutNarration(circleName: string, cycleSequence: number): string {
  return `StashUp payout - ${circleName} cycle ${cycleSequence}`.slice(0, 100).trim()
}

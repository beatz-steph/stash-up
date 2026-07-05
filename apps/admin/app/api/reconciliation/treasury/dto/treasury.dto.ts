import { z } from "zod"

/**
 * Treasury reconciliation report — mirrors the web app's
 * GET /api/cron/reconciliation payload. The admin app has no Nomba client, so
 * it proxies to that endpoint (which owns the live balance) and re-validates
 * the shape here.
 */
export const treasuryReconResSchema = z.object({
  status: z.enum(["ok", "attention"]),
  ledger: z.object({
    inboundTotalMinor: z.number().int(),
    payoutSettledOutMinor: z.number().int(),
    withdrawalSettledOutMinor: z.number().int(),
    expectedBalanceMinor: z.number().int(),
    outstandingOutboundMinor: z.number().int(),
  }),
  nomba: z.object({
    ledgerBalanceMinor: z.number().int().nullable(),
    driftMinor: z.number().int().nullable(),
    error: z.string().nullable(),
  }),
  attention: z.object({
    stuckPayouts: z.number().int(),
    stuckWithdrawals: z.number().int(),
    unmatchedInbound: z.number().int(),
    items: z.array(z.string()),
  }),
  checkedAt: z.string(),
})

export type TreasuryReconRes = z.infer<typeof treasuryReconResSchema>

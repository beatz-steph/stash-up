import { z } from "zod"

export const TransactionItemSchema = z.object({
  id: z.string(),
  // CONTRIBUTION = money you funded into a circle VA; PAYOUT = a payout you
  // received; WALLET = a wallet ledger movement (top-up, withdrawal, credit).
  kind: z.enum(["CONTRIBUTION", "PAYOUT", "WALLET"]),
  amountMinor: z.number().int(),
  circleId: z.string(),
  circleName: z.string(),
  cycleSequence: z.number().int().nullable(),
  status: z.string(),
  createdAt: z.string(),
  // WALLET only: the ledger direction (for sign) and a human label.
  direction: z.enum(["CREDIT", "DEBIT"]).nullable().default(null),
  label: z.string().nullable().default(null),
})
export type TransactionItem = z.infer<typeof TransactionItemSchema>

export const TransactionListResSchema = z.object({
  items: z.array(TransactionItemSchema),
  nextCursor: z.string().nullable(),
})
export type TransactionListRes = z.infer<typeof TransactionListResSchema>

import { z } from "zod"

export const TransactionItemSchema = z.object({
  id: z.string(),
  // CONTRIBUTION = money you funded into a circle VA; PAYOUT = a payout you received.
  kind: z.enum(["CONTRIBUTION", "PAYOUT"]),
  amountMinor: z.number().int(),
  circleId: z.string(),
  circleName: z.string(),
  cycleSequence: z.number().int().nullable(),
  status: z.string(),
  createdAt: z.string(),
})
export type TransactionItem = z.infer<typeof TransactionItemSchema>

export const TransactionListResSchema = z.object({
  items: z.array(TransactionItemSchema),
  nextCursor: z.string().nullable(),
})
export type TransactionListRes = z.infer<typeof TransactionListResSchema>

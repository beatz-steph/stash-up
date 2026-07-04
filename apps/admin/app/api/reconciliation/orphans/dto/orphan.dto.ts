import { z } from "zod"
import { paginationSchema } from "../../../users/dto/users.dto"

export { paginationSchema }

export const orphanListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      nombaTransactionId: z.string(),
      amountMinor: z.number(),
      currency: z.string(),
      entryType: z.string(),
      txType: z.string().nullable(),
      senderName: z.string().nullable(),
      narration: z.string().nullable(),
      transactionAt: z.date().or(z.string()),
      spooledAt: z.date().or(z.string()),
      // Who the credit will/would land on (VA owner).
      member: z.object({
        membershipId: z.string(),
        name: z.string().nullable(),
        circleId: z.string(),
        circleName: z.string(),
      }),
    })
  ),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export const resolveOrphanReqSchema = z.object({
  note: z.string().max(500).optional(),
})

export const ignoreOrphanReqSchema = z.object({
  note: z.string().min(1, "A note is required when ignoring").max(500),
})

import { z } from "zod"
import { paginationSchema } from "../../users/dto/users.dto"

export { paginationSchema }

export const reconciliationListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      nombaTransactionId: z.string(),
      amountMinor: z.number(),
      currency: z.string(),
      senderName: z.string().nullable(),
      senderBank: z.string().nullable(),
      senderAccountNumber: z.string().nullable(),
      narration: z.string().nullable(),
      matchStatus: z.string(),
      receivedAt: z.date().or(z.string()),
    })
  ),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

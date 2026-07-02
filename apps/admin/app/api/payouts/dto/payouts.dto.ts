import { z } from "zod"
import { paginationSchema } from "../../users/dto/users.dto"

export { paginationSchema }

export const payoutListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      cycleId: z.string(),
      amountMinor: z.number(),
      nombaTransferId: z.string().nullable(),
      nombaStatus: z.string().nullable(),
      recipientBankName: z.string(),
      recipientAccountName: z.string(),
      status: z.string(),
      failureReason: z.string().nullable(),
      createdAt: z.date().or(z.string()),
    })
  ),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

import { z } from "zod"
import { paginationSchema } from "../../users/dto/users.dto"

export { paginationSchema }

export const webhookListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      providerEventId: z.string(),
      eventType: z.string(),
      signatureValid: z.boolean(),
      processed: z.boolean(),
      processingError: z.string().nullable(),
      createdAt: z.date().or(z.string()),
    })
  ),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

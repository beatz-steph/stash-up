import { z } from "zod"
import { paginationSchema } from "../../users/dto/users.dto"

export { paginationSchema }

export const auditListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      adminUserId: z.string(),
      adminName: z.string(),
      action: z.string(),
      entityType: z.string().nullable(),
      entityId: z.string().nullable(),
      metadata: z.any().nullable(),
      createdAt: z.date().or(z.string()),
    })
  ),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

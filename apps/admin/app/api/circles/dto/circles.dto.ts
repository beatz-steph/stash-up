import { z } from "zod"
import { paginationSchema } from "../../users/dto/users.dto"

export { paginationSchema }

export const circleListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      frequency: z.string(),
      contributionMinor: z.number(),
      totalSlots: z.number(),
      createdAt: z.date().or(z.string()),
      creatorId: z.string(),
    })
  ),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export const circleDetailResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  frequency: z.string(),
  contributionMinor: z.number(),
  totalSlots: z.number(),
  createdAt: z.date().or(z.string()),
  creatorId: z.string(),
  members: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      name: z.string(),
      role: z.string(),
      status: z.string(),
      payoutPosition: z.number(),
      vaStatus: z.string(),
      virtualAccount: z
        .object({
          bankName: z.string(),
          accountName: z.string(),
          accountNumber: z.string(),
        })
        .nullable(),
    })
  ),
  cycles: z.array(
    z.object({
      id: z.string(),
      sequence: z.number(),
      status: z.string(),
      potCollectedMinor: z.number(),
      potExpectedMinor: z.number(),
    })
  ),
})

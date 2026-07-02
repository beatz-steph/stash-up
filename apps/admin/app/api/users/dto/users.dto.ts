import { z } from "zod"

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const userListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      username: z.string(),
      createdAt: z.date().or(z.string()),
      lifetimeDefaultCount: z.number(),
      blockedFromCircles: z.boolean(),
    })
  ),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export const userDetailResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string(),
  createdAt: z.date().or(z.string()),
  lifetimeDefaultCount: z.number(),
  blockedFromCircles: z.boolean(),
  withdrawalAccount: z
    .object({
      bankName: z.string(),
      accountName: z.string(),
      accountNumber: z.string(),
    })
    .nullable(),
  memberships: z.array(
    z.object({
      id: z.string(),
      circleId: z.string(),
      circleName: z.string(),
      role: z.string(),
      status: z.string(),
      joinedAt: z.date().or(z.string()),
    })
  ),
})

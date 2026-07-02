import { z } from "zod"

export const configResponseSchema = z.object({
  id: z.string(),
  provider: z.string(),
  baseUrl: z.string(),
  status: z.string(),
  clientId: z.string(), // This will be masked
  updatedAt: z.date().or(z.string()),
})

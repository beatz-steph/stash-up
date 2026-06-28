import { z } from "zod"

export const UsernameAvailableResSchema = z.object({
  available: z.boolean(),
  reason: z.literal("invalid").optional(),
})

export type UsernameAvailableRes = z.infer<typeof UsernameAvailableResSchema>

import { z } from "zod"

export const OnboardingStatusSchema = z.object({
  account: z.boolean(),
  verified: z.boolean(),
  withdrawal: z.boolean(),
})

export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>

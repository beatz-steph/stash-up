import { z } from "zod"

export const BankSchema = z.object({
  code: z.string(),
  name: z.string(),
})

export type Bank = z.infer<typeof BankSchema>

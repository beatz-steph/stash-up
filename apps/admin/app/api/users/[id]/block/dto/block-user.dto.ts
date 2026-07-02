import { z } from "zod"

export const BlockUserReqSchema = z.object({
  blocked: z.boolean(),
})

export type BlockUserReq = z.infer<typeof BlockUserReqSchema>

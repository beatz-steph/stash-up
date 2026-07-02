import { z } from "zod"
import { ConfigStatus } from "@workspace/db"

export const ToggleConfigReqSchema = z.object({
  status: z.nativeEnum(ConfigStatus),
})

export type ToggleConfigReq = z.infer<typeof ToggleConfigReqSchema>

import { z } from "zod"

export const ResolveTransferReqSchema = z.object({
  matchedCycleId: z.string().optional(),
  matchedMembershipId: z.string().optional(),
}).refine((data) => {
  if (data.matchedMembershipId && !data.matchedCycleId) {
    return false
  }
  return true
}, {
  message: "matchedCycleId is required if matchedMembershipId is provided",
  path: ["matchedCycleId"]
})

export type ResolveTransferReq = z.infer<typeof ResolveTransferReqSchema>

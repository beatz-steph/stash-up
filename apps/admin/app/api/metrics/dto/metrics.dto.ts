import { z } from "zod"

export const metricsResponseSchema = z.object({
  users: z.object({
    total: z.number(),
    blocked: z.number(),
  }),
  circles: z.object({
    forming: z.number(),
    active: z.number(),
    completed: z.number(),
    cancelled: z.number(),
  }),
  cycles: z.object({
    open: z.number(),
    collecting: z.number(),
    awaitingResolution: z.number(),
    readyToPayout: z.number(),
    payoutInitiated: z.number(),
    paidOut: z.number(),
    closed: z.number(),
    cancelled: z.number(),
  }),
  needsAttention: z.object({
    reconciliationBacklog: z.number(),
    pendingOrphans: z.number(),
    failedPayouts: z.number(),
    awaitingResolutionCycles: z.number(),
  }),
  transactions: z.object({
    inbound: z.object({ count: z.number(), valueMinor: z.number() }),
    outbound: z.object({ count: z.number(), valueMinor: z.number() }),
  }),
})

export type MetricsResponseDto = z.infer<typeof metricsResponseSchema>

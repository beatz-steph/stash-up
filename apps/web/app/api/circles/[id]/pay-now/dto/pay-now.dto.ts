import { z } from "zod";

/**
 * POST /api/circles/[id]/pay-now — settle the current cycle's amount due on
 * demand, either from the wallet balance or a saved card. `method` is explicit
 * (not a waterfall) so a member paying by card doesn't have their wallet
 * silently drained.
 */
export const PayNowReqSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("WALLET") }),
  z.object({ method: z.literal("CARD"), savedCardId: z.string().min(1) }),
]);
export type PayNowReq = z.infer<typeof PayNowReqSchema>;

export const PayNowResSchema = z.object({
  method: z.enum(["WALLET", "CARD"]),
  // WALLET: applied immediately. CARD: "charging" — settles via the webhook.
  status: z.enum(["APPLIED", "CHARGING"]),
  // WALLET only — how much was taken from the wallet toward the contribution.
  debitedMinor: z.number().int().default(0),
  // What's still owed on this cycle after this action (0 once fully paid).
  remainingDueMinor: z.number().int(),
});
export type PayNowRes = z.infer<typeof PayNowResSchema>;

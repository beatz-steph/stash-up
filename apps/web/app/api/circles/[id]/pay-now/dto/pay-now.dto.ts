import { z } from "zod";

/**
 * POST /api/circles/[id]/pay-now — settle the current cycle's amount due on
 * demand, either from the wallet balance (instant) or by card via a one-time
 * hosted checkout. `method` is explicit (not a waterfall) so a member paying by
 * card doesn't have their wallet silently drained. Cards are never saved.
 */
export const PayNowReqSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("WALLET") }),
  z.object({ method: z.literal("CARD") }),
]);
export type PayNowReq = z.infer<typeof PayNowReqSchema>;

export const PayNowResSchema = z.object({
  method: z.enum(["WALLET", "CARD"]),
  // WALLET → "APPLIED" (debited immediately). CARD → "CHECKOUT": redirect the
  // member to `checkoutLink`; the contribution is applied on settlement.
  status: z.enum(["APPLIED", "CHECKOUT"]),
  // WALLET only — how much was taken from the wallet toward the contribution.
  debitedMinor: z.number().int().default(0),
  // What's still owed on this cycle after this action (0 once fully paid).
  remainingDueMinor: z.number().int(),
  // Present only when status is CHECKOUT — Nomba hosted-checkout URL.
  checkoutLink: z.string().nullable().default(null),
});
export type PayNowRes = z.infer<typeof PayNowResSchema>;

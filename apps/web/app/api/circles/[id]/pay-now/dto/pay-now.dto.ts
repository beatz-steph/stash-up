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

/** Handle for completing a 3DS/OTP-gated card charge via POST /api/cards/otp. */
export const CardOtpHandleSchema = z.object({
  orderReference: z.string(),
  transactionId: z.string(),
});
export type CardOtpHandle = z.infer<typeof CardOtpHandleSchema>;

export const PayNowResSchema = z.object({
  method: z.enum(["WALLET", "CARD"]),
  // WALLET: applied immediately. CARD: "CHARGING" settles via the webhook;
  // "OTP_REQUIRED" needs the customer to enter the OTP Nomba just sent.
  status: z.enum(["APPLIED", "CHARGING", "OTP_REQUIRED"]),
  // WALLET only — how much was taken from the wallet toward the contribution.
  debitedMinor: z.number().int().default(0),
  // What's still owed on this cycle after this action (0 once fully paid).
  remainingDueMinor: z.number().int(),
  // Present only when status is OTP_REQUIRED.
  otp: CardOtpHandleSchema.nullable().default(null),
});
export type PayNowRes = z.infer<typeof PayNowResSchema>;

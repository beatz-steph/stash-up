import { z } from "zod";

/** POST /api/cards/enroll — add a NEW card (tokenizing checkout). circleId
 * optional: present = from a circle (Path B), absent = from Settings (Path C). */
export const EnrollCardReqSchema = z.object({
  circleId: z.string().min(1).optional(),
});
export type EnrollCardReq = z.infer<typeof EnrollCardReqSchema>;

/** Both enroll paths return a hosted-checkout link to redirect the member to. */
export const EnrollCardResSchema = z.object({
  checkoutLink: z.string(),
  orderReference: z.string(),
  /** "contribution" = the charge IS the cycle contribution; "verification" =
   * ₦50 refundable hold (member is paid up or has no open cycle). */
  mode: z.enum(["contribution", "verification"]),
  amountMinor: z.number(),
});
export type EnrollCardRes = z.infer<typeof EnrollCardResSchema>;

/** GET /api/cards — one row per saved card, with the circles it auto-debits. */
export const SavedCardResSchema = z.object({
  id: z.string(),
  last4: z.string().nullable(),
  cardType: z.string().nullable(),
  status: z.enum(["ACTIVE", "EXPIRED", "REVOKED"]),
  createdAt: z.string(),
  boundCircles: z.array(z.object({ circleId: z.string(), circleName: z.string() })),
});
export type SavedCardRes = z.infer<typeof SavedCardResSchema>;

export const SavedCardListResSchema = z.array(SavedCardResSchema);
export type SavedCardListRes = z.infer<typeof SavedCardListResSchema>;

/** POST /api/circles/[id]/auto-debit — bind one saved card to this circle. */
export const LinkAutoDebitReqSchema = z.object({
  savedCardId: z.string().min(1),
});
export type LinkAutoDebitReq = z.infer<typeof LinkAutoDebitReqSchema>;

export const LinkAutoDebitResSchema = z.object({
  autoDebitCardId: z.string(),
  /** true if a contribution charge was kicked off immediately (paid-in mode). */
  chargeInitiated: z.boolean(),
});
export type LinkAutoDebitRes = z.infer<typeof LinkAutoDebitResSchema>;

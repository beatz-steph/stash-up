import { z } from "zod";

/**
 * POST /api/cards/otp — complete a 3DS/OTP-gated tokenized card charge by
 * submitting the OTP the customer received. The `orderReference` +
 * `transactionId` come from the charge response (pay-now / wallet top-up).
 */
export const CardOtpReqSchema = z.object({
  orderReference: z.string().min(1),
  transactionId: z.string().min(1),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "Enter the numeric OTP you received"),
});
export type CardOtpReq = z.infer<typeof CardOtpReqSchema>;

export const CardOtpResSchema = z.object({
  submitted: z.boolean(),
  message: z.string(),
});
export type CardOtpRes = z.infer<typeof CardOtpResSchema>;

/**
 * DELETE /api/cards/otp — abandon an OTP-gated charge the customer never
 * completed, so a retry isn't blocked by the still-PENDING attempt.
 */
export const CardOtpCancelReqSchema = z.object({
  orderReference: z.string().min(1),
});
export type CardOtpCancelReq = z.infer<typeof CardOtpCancelReqSchema>;

export const CardOtpCancelResSchema = z.object({
  cancelled: z.boolean(),
});
export type CardOtpCancelRes = z.infer<typeof CardOtpCancelResSchema>;

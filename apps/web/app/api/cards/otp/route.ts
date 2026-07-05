import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { submitCardOtp } from "@/lib/nomba-client";
import {
  CardOtpReqSchema,
  CardOtpCancelReqSchema,
  type CardOtpRes,
  type CardOtpCancelRes,
} from "./dto/card-otp.dto";

/**
 * Complete a 3DS/OTP-gated tokenized card charge. On some Nomba accounts a
 * saved-card charge returns "OTP sent" instead of settling; the customer enters
 * that OTP here and we forward it to Nomba, which finishes the charge and fires
 * the settlement webhook (applied by the existing handlers). We only accept an
 * OTP for a PENDING ChargeAttempt owned by the requesting user.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return apiError("Unauthorized", 401);

  const parsed = CardOtpReqSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid OTP", 422);
  }
  const { orderReference, transactionId, otp } = parsed.data;

  // The orderReference must map to a PENDING charge the caller owns — this is
  // what authorizes submitting an OTP against it.
  const attempt = await prisma.chargeAttempt.findUnique({
    where: { orderReference },
    select: { userId: true, status: true },
  });
  if (!attempt || attempt.userId !== session.user.id) {
    return apiError("Payment not found", 404);
  }
  if (attempt.status !== "PENDING") {
    return apiError("This payment isn't waiting for an OTP", 409);
  }

  if (await isNombaIntegrationDisabled()) {
    return apiError("Card payments are temporarily unavailable", 503);
  }

  let result: { status: boolean; message: string };
  try {
    result = await submitCardOtp({ otp, orderReference, transactionId });
  } catch (err) {
    console.error(
      "[cards/otp] submit failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("That OTP couldn't be verified. Check it and try again.", 502);
  }

  if (!result.status) {
    return apiError(result.message || "That OTP was not accepted. Try again.", 400);
  }

  // Charge completes at Nomba now; the settlement webhook (or verify backstop)
  // applies the money and flips the attempt to SUCCESS.
  return apiSuccess<CardOtpRes>({ submitted: true, message: result.message || "success" });
}

/**
 * Abandon an OTP-gated charge the customer closed without completing. Marks the
 * still-PENDING attempt FAILED so an immediate retry isn't blocked by the
 * "already processing" guard. Idempotent: a non-PENDING attempt is a no-op. We
 * do NOT cancel at Nomba — an un-OTP'd charge simply expires, and if it somehow
 * still settles, the webhook's idempotent apply keeps the money attributable.
 */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session?.user) return apiError("Unauthorized", 401);

  const parsed = CardOtpCancelReqSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("Invalid request", 422);

  const attempt = await prisma.chargeAttempt.findUnique({
    where: { orderReference: parsed.data.orderReference },
    select: { id: true, userId: true, status: true },
  });
  if (!attempt || attempt.userId !== session.user.id) {
    return apiError("Payment not found", 404);
  }
  if (attempt.status !== "PENDING") {
    // Already settled/failed — nothing to abandon.
    return apiSuccess<CardOtpCancelRes>({ cancelled: false });
  }

  await prisma.chargeAttempt.update({
    where: { id: attempt.id },
    data: { status: "FAILED", failureReason: "otp_abandoned" },
  });
  return apiSuccess<CardOtpCancelRes>({ cancelled: true });
}

import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { submitCardOtp } from "@/lib/nomba-client";
import { CardOtpReqSchema, type CardOtpRes } from "./dto/card-otp.dto";

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

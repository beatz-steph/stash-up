import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import {
  submitCardOtp,
  verifyCheckoutTransaction,
  fetchCheckoutTransactionIds,
} from "@/lib/nomba-client";
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

  // Nomba's checkout OTP endpoint keys on a transaction id whose source isn't
  // documented for the tokenized flow: the charge response's `orderId` is
  // rejected as "No valid transaction found", and the docs' own example uses the
  // orderReference as the transactionId. So try the identifiers we have — the
  // real transaction id from the transaction lookup first, then the
  // orderReference, then the client-supplied orderId — moving on ONLY when Nomba
  // says the transaction id was wrong (never re-submitting against a bad OTP).
  // The OTP transaction id is the checkout transaction's `paymentReference`
  // (confirmed against Nomba: the charge response's orderId is rejected as "no
  // valid transaction"). Fall back to the other references only if the lookup
  // can't supply it.
  const candidates: string[] = [];
  try {
    const { ids } = await fetchCheckoutTransactionIds(orderReference);
    candidates.push(...ids);
  } catch (err) {
    console.warn("[cards/otp] checkout txn lookup failed:", err instanceof Error ? err.message : err);
  }
  candidates.push(orderReference);
  if (transactionId) candidates.push(transactionId);
  const uniqueCandidates = [...new Set(candidates)];

  let result: { status: boolean; code: string; message: string } | null = null;
  for (const txId of uniqueCandidates) {
    try {
      result = await submitCardOtp({ otp, orderReference, transactionId: txId });
    } catch (err) {
      console.error(
        "[cards/otp] submit transport error:",
        err instanceof Error ? err.message : err
      );
      return apiError("That OTP couldn't be verified. Check it and try again.", 502);
    }
    if (result.status) break;
    // Only a wrong-transaction-id error is worth retrying with the next id; a
    // real error (bad/expired OTP) should surface immediately.
    if (!/no valid transaction|transaction not found|invalid transaction/i.test(result.message)) {
      break;
    }
  }

  if (!result || !result.status) {
    // "Already completed" means the id was RIGHT but the charge is terminal.
    // On this account 3DS/merchant-initiated tokenized charges reach a terminal
    // decline before the OTP can complete them — confirm the real money outcome:
    // if it somehow settled the webhook credits it; otherwise the card charge
    // couldn't be authorized, so point the user at a path that works.
    if (result && /already completed/i.test(result.message)) {
      try {
        const v = await verifyCheckoutTransaction(orderReference);
        if (v.settled) {
          return apiSuccess<CardOtpRes>({ submitted: true, message: "success" });
        }
      } catch {
        // fall through to the conflict below
      }
      return apiError(
        "Your bank couldn't authorize this card payment. Please top up your wallet by bank transfer, or pay with a bank transfer instead.",
        409
      );
    }
    return apiError(result?.message || "That OTP was not accepted. Try again.", 400);
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

import { apiSuccess, apiError } from "@/lib/api/response";
import crypto from "crypto";
import { prisma } from "@workspace/db";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/redis";
import { verifyNombaSignature, NombaWebhookPayload } from "@/lib/webhooks/verify";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";

export async function POST(request: Request) {
  // 1. Read raw body text for payload hash and parsing
  const rawBody = await request.text();

  let payload: NombaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    // Malformed JSON is not retriable. Return 200 to stop retry.
    return apiSuccess({ received: true }, 200);
  }

  const requestId = payload.requestId;
  const eventType = payload.event_type;

  if (!requestId || !eventType) {
    return apiSuccess({ received: true }, 200);
  }

  // 2. Dedup: Redis claim
  const isNewEvent = await claimWebhookEvent("NOMBA", requestId);
  if (!isNewEvent) {
    return apiSuccess({ received: true }, 200);
  }

  // 3. Verify signature (headers come off the incoming Request)
  const signature = request.headers.get("nomba-signature") || "";
  const timestamp = request.headers.get("nomba-timestamp") || "";
  const signatureKey = process.env.NOMBA_SIGNATURE_KEY || "";

  const signatureValid = verifyNombaSignature({
    payload,
    signature,
    timestamp,
    signatureKey,
  });

  // Calculate hash
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  let receipt;
  try {
    // 4. DB Insert
    receipt = await prisma.webhookReceipt.create({
      data: {
        provider: "NOMBA",
        providerEventId: requestId,
        eventType,
        payloadHash,
        signatureValid,
        rawPayload: rawBody,
        processed: false,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      // P2002: Unique constraint violation (fallback dedup or retry)
      // Fetch the existing receipt
      const existingReceipt = await prisma.webhookReceipt.findUnique({
        where: {
          provider_providerEventId: {
            provider: "NOMBA",
            providerEventId: requestId,
          },
        },
      });

      if (!existingReceipt) {
        // Race condition, just return 200 and let it retry if necessary
        return apiSuccess({ received: true }, 200);
      }

      if (existingReceipt.processed) {
        // Already successfully processed, return 200
        return apiSuccess({ received: true }, 200);
      } else {
        // Exists but not processed (e.g. previous crash). Re-dispatch.
        receipt = existingReceipt;
      }
    } else {
      // Other DB error, return 500 so Nomba retries
      console.error("[Webhook Error] Unexpected failure inserting receipt:", err);
      await releaseWebhookEvent("NOMBA", requestId);
      return apiError("Internal Server Error", 500);
    }
  }

  if (!receipt.signatureValid) {
    // Persist receipt but don't dispatch.
    return apiSuccess({ received: true }, 200);
  }

  // 5. Dispatch
  try {
    await dispatchWebhookEvent(receipt, payload);
    
    // Mark processed
    await prisma.webhookReceipt.update({
      where: { id: receipt.id },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[Webhook Error] Dispatch failure:", err);
    await prisma.webhookReceipt.update({
      where: { id: receipt.id },
      data: {
        processingError: err instanceof Error ? err.message : String(err),
      },
    });
    // RELEASE the Redis claim so next retry doesn't falsely return 200
    await releaseWebhookEvent("NOMBA", requestId);
    return apiError("Internal Server Error", 500);
  }

  return apiSuccess({ received: true }, 200);
}

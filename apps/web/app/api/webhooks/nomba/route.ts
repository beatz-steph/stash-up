import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@workspace/db";
import { claimWebhookEvent } from "@/lib/redis";
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
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const requestId = payload.requestId;
  const eventType = payload.event_type;

  if (!requestId || !eventType) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // 2. Dedup: Redis claim
  const isNewEvent = await claimWebhookEvent("NOMBA", requestId);
  if (!isNewEvent) {
    return NextResponse.json({ received: true }, { status: 200 });
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
      },
    });

    if (!signatureValid) {
      // Persist receipt but don't dispatch.
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // 5. Dispatch
    await dispatchWebhookEvent(receipt, payload);

  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      // P2002: Unique constraint violation (fallback dedup)
      return NextResponse.json({ received: true }, { status: 200 });
    }
    // For all other errors (e.g. DB unreachable, dispatch crash), we log and return 500
    // so that Nomba triggers its retry mechanism, preventing permanent data loss.
    console.error("[Webhook Error] Unexpected failure:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

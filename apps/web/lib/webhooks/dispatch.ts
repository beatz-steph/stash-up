import { WebhookReceipt } from "@workspace/db";
import { NombaWebhookPayload } from "./verify";

export async function dispatchWebhookEvent(
  receipt: WebhookReceipt,
  payload: NombaWebhookPayload
): Promise<void> {
  const eventType = payload.event_type;

  switch (eventType) {
    case "payment_success":
      // Sprint 4: Reconcile contribution
      console.log(`[Webhook] Dispatching payment_success for receipt ${receipt.id}`);
      break;
    case "payout_success":
    case "payout_failed":
    case "payout_refund":
      // Sprint 5: Handle payout status updates
      console.log(`[Webhook] Dispatching ${eventType} for receipt ${receipt.id}`);
      break;
    default:
      console.log(`[Webhook] Unhandled event_type: ${eventType}`);
  }
}

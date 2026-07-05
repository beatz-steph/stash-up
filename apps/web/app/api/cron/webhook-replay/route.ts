import { apiSuccess, apiError } from "@/lib/api/response";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { replayWebhooks } from "@/lib/nomba-client";

/**
 * Webhook replay sweep — the recovery backstop for missed/failed webhooks.
 * Asks Nomba to re-push any money event whose delivery to us failed or is
 * uncertain within a recent window (e.g. our endpoint was briefly down, or a
 * dev tunnel was off). Nomba re-sends them, correctly signed, to our webhook
 * URL; the WebhookReceipt + business-level idempotency make duplicate
 * deliveries safe. Once an event is delivered (PUSHED) it drops out of the
 * replay filter, so this self-heals and stops.
 *
 * Triggered on an interval by an external scheduler (Railway) with the
 * CRON_SECRET bearer — see the deploy runbook.
 */

// Safe-to-replay delivery states. Deliberately excludes PUSHED (already
// delivered) so we don't re-push successful events on every run.
const REPLAY_STATUSES = ["INITIATED", "FAILED", "INCONCLUSIVE"] as const;

// The money events our dispatcher acts on (Nomba's UPPER_CASE filter names).
// PAYMENT_SUCCESS covers both VA transfers and card settlements.
const REPLAY_EVENT_TYPES = [
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "PAYOUT_SUCCESS",
  "PAYOUT_FAILED",
] as const;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return apiError("Unauthorized", 401);
  }

  if (await isNombaIntegrationDisabled()) {
    return apiError("Nomba integration is disabled", 503);
  }

  // Window: last N hours (default 6). Generous overlap is fine — failed events
  // are re-requested until they succeed, then age out; idempotency dedups.
  const url = new URL(request.url);
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 6, 1), 168);
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

  try {
    const result = await replayWebhooks({
      startDate: from.toISOString(),
      endDate: to.toISOString(),
      statuses: [...REPLAY_STATUSES],
      eventTypes: [...REPLAY_EVENT_TYPES],
    });

    return apiSuccess({
      window: { from: from.toISOString(), to: to.toISOString() },
      statuses: REPLAY_STATUSES,
      eventTypes: REPLAY_EVENT_TYPES,
      description: result.description,
    });
  } catch (err) {
    console.error(
      "[webhook-replay] replay request failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Webhook replay request failed", 502);
  }
}

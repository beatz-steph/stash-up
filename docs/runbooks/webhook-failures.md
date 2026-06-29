# Webhook Failures Runbook

## Overview
Webhooks from Nomba can fail processing for several reasons: duplicate deliveries, malformed payloads, invalid signatures, or internal server errors during processing.

## Verification (sandbox, 2026-06-29)
The webhook spine was smoke-tested against the running app with the hackathon signature key:
- **Valid signature** (HMAC-SHA256/Base64 of the colon-joined fields with `NOMBA_SIGNATURE_KEY`) → `HTTP 200`, receipt persisted with `signatureValid = true`, dispatch invoked.
- **Duplicate `requestId`** → `HTTP 200` (~10ms), no insert, no dispatch (Redis fast-path dedup).
- **Bad signature** → `HTTP 200`, receipt persisted with `signatureValid = false`, **no dispatch**.

Re-verify the same three cases after any change to `verify.ts` or the receiver order.

## Dedup model (source of truth)
Dedup is durable in the **DB**: the `WebhookReceipt` unique constraint on `(provider, providerEventId=requestId)` is the authority. Redis `claimWebhookEvent` is only a fast path — if Redis is unavailable it degrades to `true` (proceed) and the DB unique catches duplicates (the route returns `200` on `P2002`). So a Redis outage does **not** drop webhooks.

## Inspecting WebhookReceipts
Every accepted webhook is written to the `WebhookReceipt` table in Prisma. 

```sql
SELECT * FROM "WebhookReceipt" ORDER BY "createdAt" DESC LIMIT 10;
```

Check the `signatureValid` column:
- **`true`:** Signature verified successfully.
- **`false`:** The HMAC comparison failed. This indicates either a key mismatch, payload tampering, or an issue with the colon-joined string concatenation logic.

Check the `processed` column:
- **`true`:** The event was successfully dispatched.
- **`false`:** The event failed processing (look at `processingError`).

## Signature Mismatch Triage
If you see `signatureValid = false`:
1. Verify `NOMBA_SIGNATURE_KEY` in the environment exactly matches the Dashboard.
2. Ensure you are reading the headers correctly (`nomba-signature` and `nomba-timestamp`).
3. If an event has a `null` `responseCode` string literal from Nomba, our `verify.ts` logic already coerces it to an empty string. Verify Nomba hasn't introduced new `null` literals for other fields.

## Replaying Webhooks
Since we have `rawPayload` in the `WebhookReceipt`, we can replay a webhook locally:

```bash
curl -X POST http://localhost:3000/api/webhooks/nomba \
  -H "nomba-signature: <sig>" \
  -H "nomba-timestamp: <timestamp>" \
  -d '{"event_type": "...", "requestId": "..."}'
```
*Note: dedup keys on `requestId` (Redis fast path + the durable `WebhookReceipt` unique
constraint), so to replay you must use a fresh `requestId` — and recompute the signature,
since it covers `requestId`. A previously-seen `requestId` is deduped (200, no dispatch).*

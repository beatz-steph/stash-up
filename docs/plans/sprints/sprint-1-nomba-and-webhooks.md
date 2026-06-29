# Sprint 1 — Nomba Integration Layer + Webhook Spine

**Goal:** make the Nomba client production-shaped and tested, add name enquiry, and build the
**webhook receiver** with the mandatory safety order. This is the spine everything downstream
rides on — prove it against the Nomba **sandbox** early.

**Prerequisites:** Sprint 0. **Blocks:** Sprints 3, 4, 5.

> **No hallucination:** `lib/nomba-client.ts` already has token issue/refresh,
> `createVirtualAccount`, `initiateSubAccountBankTransfer`, `getSubAccountBalance`. Implement
> against the **real Nomba API reference** — do not invent endpoints/payloads. If a Nomba
> endpoint's exact shape is unknown, leave a typed wrapper + `// VERIFY against Nomba docs`.

---

## A. Nomba client hardening (`apps/web/lib/nomba-client.ts`)
- Audit token caching (Redis `nomba:token`), refresh-on-expiry, and error propagation.
- Add **name enquiry** (account name resolution) to replace the sandbox stub in
  `app/api/withdrawal-account/resolve/route.ts`. Wrapper: `resolveBankAccount({ bankCode,
  accountNumber }) → { accountName }`.
- Ensure every call: sends `accountId` header + bearer token; throws typed errors with status;
  **never logs secrets/tokens**.
- Extract pure helpers where useful (e.g. kobo↔naira: `minorToNaira`, `nairaToMinor`) into a
  testable module `lib/money.ts`.

## B. Webhook receiver (`apps/web/app/api/webhooks/nomba/route.ts`) — NEW
Mandatory order (CLAUDE.md "Nomba Webhook Safety"):
1. Read **raw body** via `req.text()` (no JSON parse first; body parser effectively off).
2. **Dedup**: `claimWebhookEvent("NOMBA", requestId)` (Redis) AND insert `WebhookReceipt` on
   unique `(provider, providerEventId=requestId)`. Duplicate → `200 OK` stop.
3. **Verify** HMAC-SHA256 of the raw body against the `nomba-signature` header using
   `NOMBA_WEBHOOK_SECRET`, timing-safe (`crypto.timingSafeEqual`). Record `signatureValid` on
   the receipt. Invalid → still `200` (don't leak), mark unprocessed.
4. Parse, branch by `eventType`, and **dispatch** to a handler (Sprint 4/5 fill business
   logic). For this sprint: persist the `WebhookReceipt` (rawPayload, payloadHash, eventType),
   leave a typed dispatch switch with `// Sprint 4`/`// Sprint 5` stubs.
5. **Always return 200** (Nomba retries on non-200).

Extract the verification + dedup decision into pure functions for testing
(`lib/webhooks/verify.ts`: `verifyNombaSignature(rawBody, signature, secret): boolean`).

## C. TDD — tests first
- `lib/webhooks/verify.test.ts`: valid signature → true; tampered body → false; wrong secret →
  false; timing-safe path.
- `app/api/webhooks/nomba/route.test.ts`: missing/invalid signature → 200 + receipt marked
  invalid + no dispatch; duplicate `requestId` → 200 + no second receipt/dispatch; valid new
  event → 200 + receipt persisted + dispatch called. Mock `redis`, `prisma`, crypto secret.
- `lib/nomba-client` tests: token cache hit skips fetch; expiry triggers refresh; name enquiry
  maps response → `{ accountName }`; transfer/VA build correct request (mock `fetch`).
- `lib/money.test.ts`: kobo↔naira round-trips, no float drift.

## D. Documentation
- Fill `docs/architecture/nomba-integration.md`: token lifecycle, each client function's
  request/response, the webhook contract (header, `requestId`, `aliasAccountReference`,
  `transactionAmount`), and the safety order.
- `docs/runbooks/webhook-failures.md`: how to inspect `WebhookReceipt`, replay, signature
  mismatch triage.
- `docs/api/README.md`: add the webhook route row.

## E. Acceptance criteria
- [ ] Webhook route follows the exact safety order; always returns 200; dedup + signature
      verify covered by tests.
- [ ] Name enquiry wired into `resolve` route (sandbox stub removed) and tested.
- [ ] Nomba client + money helpers tested with `fetch`/`redis` mocked; no real network in tests.
- [ ] (If sandbox creds available) a manual smoke note in the runbook proving a real VA create
      + a real signed webhook verified.
- [ ] Docs + typecheck/lint/tests green.

## F. Out of scope
No reconciliation or payout business logic yet (just the dispatch stubs). No circle code.

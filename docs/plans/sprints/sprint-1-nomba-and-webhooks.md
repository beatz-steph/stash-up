# Sprint 1 — Nomba Integration Layer + Webhook Spine

**Goal:** make the Nomba client production-shaped and tested, add name enquiry, and build the
**webhook receiver** with the mandatory safety order. This is the spine everything downstream
rides on — prove it against the Nomba **sandbox** early.

**Prerequisites:** Sprint 0. **Blocks:** Sprints 3, 4, 5.

> **No hallucination:** `lib/nomba-client.ts` already has token issue/refresh,
> `createVirtualAccount`, `initiateSubAccountBankTransfer`, `getSubAccountBalance`. Implement
> against the **verified Nomba API reference below** (pulled from developer.nomba.com, the
> `.md` docs). Do not invent endpoints/payloads.

---

## A0. Verified Nomba API reference (from official docs)

All endpoints require headers `Authorization: Bearer <token>` and `accountId: <parent account UUID>`.

| Operation | Method + Path | Request (body unless noted) | Response (under `data`) |
|---|---|---|---|
| Obtain token | `POST /v1/auth/token/issue` | `grant_type`, `client_id`, `client_secret` | `access_token`, `refresh_token`, `expiresAt` (ISO-8601) |
| Refresh token | `POST /v1/auth/token/refresh` | `grant_type=refresh_token`, `refresh_token` | same |
| Create virtual account | `POST /v1/accounts/virtual` | `accountRef` (16–64 chars), `accountName` (8–64 chars); optional `bvn`, `expiryDate`, `expectedAmount` | `bankAccountNumber`, `bankAccountName`, `bankName`, `accountRef`, `accountHolderId`, `callbackUrl` |
| Bank account lookup (name enquiry) | `POST /v1/transfers/bank/lookup` | `accountNumber` (10 digits), `bankCode` | `accountName` (code `'00'` on success) |
| Payout — transfer from **sub-account** | `POST /v2/transfers/bank/{subAccountId}` | `amount`, `accountNumber`, `accountName`, `bankCode`, `merchantTxRef`; optional `senderName`, `narration` | `id`, `status` (`SUCCESS`\|`PENDING_BILLING`), `meta.merchantTxRef`, `meta.rrn` |
| Fetch bank codes | `GET …/transfers/fetch-bank-codes-and-names` | — | bank list (can replace the hardcoded `/api/banks` list) |

Notes:
- `accountRef = "membership_{membershipId}"` (cuid → ~36 chars) satisfies the 16–64 constraint. ✓
- Payout is from the **sub-account** (`{subAccountId}` is a **path param**, not a body field) — matches the existing `initiateSubAccountBankTransfer`. `amount` is in **naira** (kobo ÷ 100).
- Nomba transfer `status` → Prisma `PayoutStatus`: `NEW`→`INITIATED`, `PENDING_BILLING`→`PENDING_BILLING`, `SUCCESS`→`SUCCESS`, `payout_failed`→`FAILED`, `payout_refund`/`REFUND`→`REFUNDED`.
- **TODO(verify):** whether the VA is created on the parent (`/v1/accounts/virtual`) or the
  sub-account variant (`/nomba-api-reference/virtual-accounts/create-virtual-account-for-sub-account`).
  Check what the existing `createVirtualAccount` already calls and confirm against the dashboard.

### Webhook signature (CORRECTED — this is NOT a raw-body HMAC)
- **Header:** `nomba-signature` (alias `nomba-sig-value`, same value).
- **Secret:** the dashboard **"signature key"** (Developer → Webhook Setup). Env var
  **`NOMBA_SIGNATURE_KEY`** (rename from the wrong `NOMBA_WEBHOOK_SECRET`).
- **Signed string** = colon-joined fields (NOT the raw body):
  ```
  {event_type}:{requestId}:{userId}:{walletId}:{transactionId}:{type}:{time}:{responseCode}:{nomba-timestamp}
  ```
  where `userId=data.merchant.userId`, `walletId=data.merchant.walletId`,
  `transactionId=data.transaction.transactionId`, `type=data.transaction.type`,
  `time=data.transaction.time`, `responseCode=data.transaction.responseCode`
  (treat the literal string `"null"` as empty), and `nomba-timestamp` comes from the
  **`nomba-timestamp` HTTP header** (RFC-3339).
- **Algorithm:** `HmacSHA256` (header `nomba-signature-algorithm: HmacSHA256`); **encoding: Base64** (not hex). Other header: `nomba-signature-version: 1.0.0`.
- **Event types:** money-in → `payment_success` (also `payment_failed`, `payment_reversal`);
  money-out → `payout_success` (also `payout_failed`, `payout_refund`).
- **Dedup key:** top-level `requestId` → `WebhookReceipt.providerEventId`.

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
3. **Verify** per the **Webhook signature** spec in §A0: parse the body, rebuild the
   colon-joined field string, `HmacSHA256` it with `NOMBA_SIGNATURE_KEY`, **Base64**-encode,
   and compare timing-safe against the `nomba-signature` header (decode both to `Buffer`,
   length-guard before `crypto.timingSafeEqual`). Use the `nomba-timestamp` header in the
   string. Record `signatureValid` on the receipt. Invalid → still `200` (don't leak), mark
   unprocessed, no dispatch.
4. Parse, branch by `event_type`, and **dispatch** to a handler (Sprint 4/5 fill business
   logic). For this sprint: persist the `WebhookReceipt` (rawPayload, payloadHash, eventType),
   leave a typed dispatch switch keyed on the real event names (`payment_success` → // Sprint 4;
   `payout_success`/`payout_failed`/`payout_refund` → // Sprint 5).
5. **Always return 200** (Nomba retries on non-200).

Extract verification into a pure, testable function in `lib/webhooks/verify.ts`. Because the
signed string is a **field concatenation + the timestamp header** (not the raw body), the
signature is:
```ts
verifyNombaSignature(input: {
  payload: NombaWebhookPayload,   // parsed body
  signature: string,             // nomba-signature header
  timestamp: string,             // nomba-timestamp header
  signatureKey: string,
}): boolean
```

## C. TDD — tests first
- `lib/webhooks/verify.test.ts`: build a fixture payload, compute the expected Base64 HMAC over
  the §A0 colon-joined string with a known key, assert → true; tamper any field (amount/
  responseCode/timestamp) → false; wrong key → false; `"null"` responseCode handled; length-
  guard rejects a malformed signature without throwing.
- `app/api/webhooks/nomba/route.test.ts`: missing/invalid signature → 200 + receipt marked
  invalid + no dispatch; duplicate `requestId` → 200 + no second receipt/dispatch; valid new
  event → 200 + receipt persisted + dispatch called. Mock `redis`, `prisma`, crypto secret.
- `lib/nomba-client` tests: token cache hit skips fetch; expiry triggers refresh; name enquiry
  maps response → `{ accountName }`; transfer/VA build correct request (mock `fetch`).
- `lib/money.test.ts`: kobo↔naira round-trips, no float drift.

## D. Documentation
- Fill `docs/architecture/nomba-integration.md` from §A0: the endpoint table, token lifecycle,
  the **corrected webhook signature contract** (header `nomba-signature`, the colon-joined
  signed string, Base64, `NOMBA_SIGNATURE_KEY`, the `nomba-timestamp` header), the event names,
  and the safety order.
- Update env docs: rename `NOMBA_WEBHOOK_SECRET` → `NOMBA_SIGNATURE_KEY` in `apps/web/.env`,
  `apps/web/.env.example`, `apps/admin/.env.example`, `docs/runbooks/env-reference.md`, and the
  CLAUDE.md env list + "Nomba Webhook Safety" note.
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

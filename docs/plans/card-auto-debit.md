# Card Auto-Debit ("Auto-save") — Implementation Plan

Members save a card once; StashUp automatically collects their contribution
each cycle by charging the tokenized card. Written to be executed by an LLM
agent with no prior context. **Read `CLAUDE.md` first** — API-route pattern,
money-in-kobo, `tx: Prisma.TransactionClient` typing, and the gate
(`pnpm --filter web typecheck && pnpm --filter web lint &&
pnpm --filter web test`) are non-negotiable.

## Nomba rails (VERIFIED — full OpenAPI specs reviewed 2026-07-04)

All four endpoints use the standard `nombaFetch` auth (bearer +
parent-`accountId` header) and the `{ code: "00", description, data }`
envelope. Amounts are **naira doubles** at the boundary (`"10000.00"`);
internal storage stays kobo.

- **`POST /v1/checkout/order`** — body
  `{ order: {...}, tokenizeCard: boolean }`. Order required fields:
  `callbackUrl`, `customerEmail`, `amount`, `currency: "NGN"`. We also set:
  - `orderReference` (our idempotency ref — optional to Nomba, always set it)
  - `accountId` = `NOMBA_SUB_ACCOUNT_ID` — "the account where the funds will
    be deposited"; card money lands in the same sub-account wallet as VA
    inflows/payouts (confirm in sandbox — open question #6)
  - **`allowedPaymentMethods: ["Card"]` — REQUIRED for tokenizing orders.**
    Without it the customer could pay the enrollment checkout via Transfer/
    USSD and NO card would be tokenized (silent enrollment failure).
  - `orderMetaData` (string→string map, **returned in webhook payloads**):
    `{ kind: "cardenroll"|"cardverify", userId, membershipId?, cycleId?, attemptId }`
    — the primary webhook-routing mechanism (orderReference prefixes stay as
    fallback).
  Response `data`: `{ checkoutLink, orderReference }` → redirect the member
  to `checkoutLink`.
- **`POST /v1/checkout/tokenized-card-payment`** — body
  `{ order: {...same shape...}, tokenKey }`. Sync response `data` is only
  `{ status: boolean, message }` — **no transaction id**; settlement truth
  comes from the webhook / verify backstop (attempts stay PENDING until then).
- **`POST /v1/checkout/refund`** — body `{ transactionId (REQUIRED), amount?,
  accountNumber?, bankCode? }` → `{ success, message }`. **Refunds key on
  Nomba's `transactionId`, NOT our orderReference** — capture the transaction
  id from the settlement webhook and store it on the ChargeAttempt, else the
  ₦50 cannot be refunded. Omit accountNumber/bankCode (refund to source);
  pass `amount` = the full charge.
- **`DELETE /v1/checkout/tokenized-card-data`** — body `{ tokenKey }`.
- Docs: "Always verify the transaction after charging a tokenized card"
  (webhook + Verify Transactions endpoint as backstop).
- Existing client patterns live in `apps/web/lib/nomba-client.ts`
  (`nombaFetch`; zod-parse `data`; descriptive errors on unexpected envelopes).

### Webhook facts (from the official webhooks doc, reviewed 2026-07-04)

- Supported events: `payment_success` (covers **card transactions**, VA
  payments, PayByTransfer), `payment_failed`, `payment_reversal`,
  `payout_success`, `payout_failed`, `payout_refund`. The replay API also
  lists `ORDER_SUCCESS` — check the dashboard for an order/checkout event and
  **subscribe to every event type we consume** (webhooks only fire for
  subscribed events; likely needed here: payment_success, payment_failed,
  and order_success if present).
- Signature scheme confirmed = exactly what `lib/webhooks/verify.ts` already
  implements (colon-joined `event_type:requestId:userId:walletId:
  transactionId:type:time:responseCode:nomba-timestamp`, HmacSHA256 Base64).
  No changes needed.
- **Nomba retries failed webhooks 5 times over ~95 minutes** (2m/5m/11m/24m/
  53m backoff). Our 30-min verify backstop may settle an attempt before a
  late retry arrives — fine, everything is idempotent (WebhookReceipt dedup +
  attempt status guards).
- Nomba supports an **`X-Idempotent-key` request header**. Send it on
  `chargeTokenizedCard` (use the orderReference) so a network-dropped charge
  call can be retried without double-charging.
- **Ops backstop:** Nomba exposes webhook event-logs, re-push, bulk re-push,
  and replay APIs (`/v1/webhooks/event-logs|re-push|bulk-re-push|replay`) and
  a dashboard "Webhook Repush" page — if a settlement webhook goes missing,
  it can be re-delivered rather than reconciled by hand. Worth wiring into
  admin tooling later (v2); for now document in the runbook.

## THE CORE COLLECTION RULE (product decision — implement exactly)

**Every charge attempt is computed from the member's live remaining balance at
attempt time — never from a previously planned amount.**

```
remainingDue = circle.contributionMinor − (current cycle Contribution.amountMinor ?? 0)
```

Consequences (all three were explicitly decided):
1. **Card debit failed, member later paid the cycle in full by transfer →
   no further attempt.** The sweep's eligibility predicate is
   `remainingDue > 0`; attempt history alone never triggers a retry.
2. **Member paid part by transfer → charge only the remainder.** Recompute
   `remainingDue` at sweep time; charge that, not the original amount.
3. Buffer credit is already auto-applied when a cycle opens
   (`applyBuffersToNewCycle`), so `remainingDue` is automatically net of
   carried-over credit — do NOT subtract `bufferMinor` again.

**Race acceptance:** if a transfer lands between the sweep computing
`remainingDue` and Nomba settling the charge, the charge webhook applies via
the shared matcher (`@workspace/db/reconciliation`), which computes against
current state — any excess lands in `bufferMinor` as carried-over credit.
Money is never lost or double-counted to the pot; worst case the member is
temporarily over-collected into their own credit. Document this in the UI copy
("if you also transfer manually, extra is saved as credit").

---

## Schema (packages/db/prisma/business.prisma; migration `card_auto_debit`)

```prisma
enum CardStatus {
  ACTIVE
  EXPIRED   // charge failed with an expiry/invalid-card reason
  REVOKED   // user removed the card
}

enum ChargeAttemptStatus {
  PENDING     // sent to Nomba, awaiting webhook/verification
  SUCCESS
  FAILED
  SUPERSEDED  // remainingDue hit 0 (or cycle left OPEN/COLLECTING) before this retry ran
}

enum ChargePurpose {
  CONTRIBUTION  // sweep/link charge applied to a cycle's pot
  ENROLLMENT    // new-card checkout that doubled as the contribution
  VERIFICATION  // ₦50 tokenization charge — refunded after success, never applied to a pot
}

enum RefundStatus {
  NOT_APPLICABLE
  PENDING
  REFUNDED
  FAILED       // refund call failed — surfaced for manual follow-up, retried by sweep
}

model SavedCard {
  id         String     @id @default(cuid())
  userId     String                       // user-level card LIST — multiple cards per user
  user       User       @relation(fields: [userId], references: [id])
  provider   String     @default("NOMBA")
  tokenKey   String                       // from the tokenization webhook — NEVER log this
  last4      String?
  cardType   String?
  status     CardStatus @default(ACTIVE)
  createdAt  DateTime   @default(now())
  revokedAt  DateTime?

  boundMemberships Membership[]           // circles this card auto-debits for

  @@index([userId])
}

model ChargeAttempt {
  id             String              @id @default(cuid())
  // Nullable: a VERIFICATION charge from Settings has no circle context.
  cycleId        String?
  cycle          Cycle?              @relation(fields: [cycleId], references: [id])
  membershipId   String?
  membership     Membership?         @relation(fields: [membershipId], references: [id])
  userId         String               // always known, even without a circle
  savedCardId    String?              // null until the tokenization webhook creates the card
  purpose        ChargePurpose
  amountMinor    Int                  // remainingDue charged, or 5000 (₦50) for VERIFICATION
  orderReference String              @unique  // "cardchg_{cycleId}_{membershipId}_a{n}" | "cardenroll_..." | "cardverify_{userId}_{cuid}"
  attemptNumber  Int                  // 1..MAX_ATTEMPTS per (cycle, membership); 0 for enroll/verify
  status         ChargeAttemptStatus @default(PENDING)
  failureReason  String?
  // Nomba's transaction id, captured from the settlement webhook/verify.
  // REQUIRED for refunds (POST /v1/checkout/refund keys on transactionId).
  nombaTransactionId String?
  refundStatus   RefundStatus        @default(NOT_APPLICABLE)
  refundedAt     DateTime?
  createdAt      DateTime            @default(now())
  settledAt      DateTime?

  @@unique([cycleId, membershipId, attemptNumber])
  @@index([status, createdAt])
  @@index([refundStatus])
}
```

Plus on `Membership`:

```prisma
  // Which of the user's saved cards auto-debits for THIS circle.
  // null = no auto-debit for this circle. Explicit per-circle binding —
  // saving a card for one circle NEVER enables debiting in another.
  autoDebitCardId String?
  autoDebitCard   SavedCard? @relation(fields: [autoDebitCardId], references: [id])
```

Note `User` and `Cycle`/`Membership` need the back-relation fields added.

### Card ↔ circle binding model (decided — the safety property)

- Cards are a **user-level list** (many per user). Managed in Settings.
- Auto-debit is a **per-circle binding**: `Membership.autoDebitCardId` points
  at exactly one card. Only that card is ever charged for that circle.
- **A new circle never debits any existing card automatically.** The member
  must explicitly choose: link one of their saved cards, or add a new card.
- Adding a new card during circle B's enrollment saves it to the list and
  binds it to circle B only; circle A's binding is untouched.
- Revoking a card: delete the token at Nomba, set REVOKED, and null out
  `autoDebitCardId` on every membership bound to it (notify each circle's
  member context that auto-save is off).
- A card going EXPIRED disables collection for every circle bound to it —
  notify per affected circle, prompt to rebind/update.

## Attempt lifecycle & retry policy

- `MAX_ATTEMPTS = 3` per (cycle, membership); backoff: attempt 2 no sooner
  than 24h after attempt 1 failed; attempt 3 no sooner than 72h after
  attempt 2 failed.
- A new attempt is created only when ALL hold:
  1. `membership.autoDebitCardId` is set && THAT card's `status == ACTIVE`
  2. cycle status is `OPEN` or `COLLECTING`
  3. `remainingDue > 0` (THE CORE RULE)
  4. no `PENDING` attempt exists for (cycleId, membershipId) — never
     double-charge while one is in flight
  5. attemptNumber ≤ MAX_ATTEMPTS and backoff window elapsed
- When the sweep encounters a would-be retry but `remainingDue == 0` (member
  paid by transfer) or the cycle is no longer collecting: do nothing (there is
  no pending row to update). If a `PENDING` attempt exists and the webhook
  later settles it as success, surplus flows to buffer via the matcher — fine.
- Failure reasons mapping: expired/invalid card → also set SavedCard
  `status = EXPIRED` and notify "update your card"; insufficient funds →
  normal retry path; unknown → retry path.

## Implementation stages (each = one commit, gate green)

### Stage 1 — Schema + Nomba client
- Migration above; regenerate client.
- `nomba-client.ts` (shapes verified — see "Nomba rails" above):
  - `createCheckoutOrder({ orderReference, customerEmail, amountMinor, callbackUrl, tokenizeCard, metadata })`
    → POST `/v1/checkout/order` with `order.accountId = SUB_ACCOUNT_ID`,
    `order.allowedPaymentMethods = ["Card"]` when `tokenizeCard`,
    `order.orderMetaData = metadata`. Returns `{ checkoutLink, orderReference }`.
    Kobo → naira at the boundary.
  - `chargeTokenizedCard({ orderReference, customerEmail, amountMinor, tokenKey, metadata })`
    → POST `/v1/checkout/tokenized-card-payment` `{ order, tokenKey }` with
    header `X-Idempotent-key: <orderReference>` (Nomba-supported — protects a
    network-dropped call from double-charging on retry). Sync response is
    only `{ status, message }` — treat as "accepted", not settled. NEVER log
    tokenKey.
  - `refundCheckoutTransaction({ transactionId, amountMinor })`
    → POST `/v1/checkout/refund` `{ transactionId, amount }` (omit
    accountNumber/bankCode = refund to source) → `{ success, message }`.
  - `deleteTokenizedCard(tokenKey)` → DELETE `/v1/checkout/tokenized-card-data`
    body `{ tokenKey }`.
  - `verifyCheckoutTransaction(orderReference)` — Verify Transactions endpoint
    (used by the reconcile sweep for stuck PENDING attempts; also the source
    of `nombaTransactionId` when the webhook missed).

### Stage 2 — Enrollment flow (web): two paths per circle
Enabling auto-save on a circle presents the user's card list + "Add new card".

**Path A — link an existing saved card (no checkout):**
- `POST /api/circles/[id]/auto-debit` body `{ savedCardId }`. Guards: circle
  member; card belongs to the requesting user and is ACTIVE. Sets
  `membership.autoDebitCardId`. If the current cycle is OPEN/COLLECTING and
  `remainingDue > 0`, immediately create a ChargeAttempt and charge (snappy
  UX; otherwise the next sweep handles it).
- `DELETE /api/circles/[id]/auto-debit` — unbind this circle only.

**Path B — add a NEW card from a circle (tokenizing checkout):**
- `POST /api/cards/enroll` body `{ circleId }`. Guards: member of circle.
  Cards can be added at ANY point, including mid-cycle (decided):
  - If the current cycle is OPEN/COLLECTING and `remainingDue > 0`:
    **contribution mode** — the enrollment charge IS the contribution.
    Checkout order for `remainingDue` with `tokenizeCard: true`,
    `orderReference = "cardenroll_{cycleId}_{membershipId}"`, PENDING
    ChargeAttempt (purpose ENROLLMENT, attemptNumber 0).
  - Otherwise (paid up, or no open cycle): **verification mode** — ₦50
    (`5000` kobo) checkout order with `tokenizeCard: true`,
    `orderReference = "cardverify_{userId}_{cuid}"`, PENDING ChargeAttempt
    (purpose VERIFICATION, refundStatus PENDING-to-be after settlement,
    membershipId still recorded so settlement can bind the card to this
    circle). The ₦50 is refunded after successful tokenization (Stage 3).
  Returns the checkout link either way.
  On webhook settlement: create the SavedCard in the user's list AND bind it
  to THIS membership only.

**Path C — add a card from Settings (no circle context):**
- `POST /api/cards/enroll` with no `circleId`: always **verification mode** —
  ₦50 tokenizing checkout, `orderReference = "cardverify_{userId}_{cuid}"`,
  ChargeAttempt purpose VERIFICATION with null cycle/membership. On
  settlement: SavedCard created (bound to nothing — user links it to circles
  later), refund triggered.
- UI copy must say: "We'll charge ₦50 to verify your card and refund it
  right after. Processing fees may be deducted from the refund." (DECIDED:
  Nomba nets fees out of refunds — we tell the customer up front rather than
  absorbing/topping up.)

**Card management (user-level):**
- `GET /api/cards` — the user's card list (id/last4/brand/status + which
  circles each is bound to).
- `DELETE /api/cards/[id]` — revoke: Nomba token delete, status REVOKED,
  null `autoDebitCardId` on all bound memberships.
- UI: "Auto-save" block in circle detail (card picker + add-new → checkout
  redirect); Settings "Saved cards" section (list, bindings, remove). Follow
  existing feature/mutation patterns; typed wrappers in `lib/api/data/cards/`.

### Stage 3 — Webhook handling (dispatch.ts)
- **Pre-req (dashboard):** subscribe to `payment_success`, `payment_failed`
  (and `order_success` if it exists) under Developer → Webhook Setup —
  webhooks only fire for subscribed event types.
- **First capture the real card-settlement payload in sandbox** (open
  question #1: where tokenKey/orderMetaData/transactionId sit for card
  payments — the docs' payment_success sample is a VA transfer, and card
  charges land under the SAME event type our VA flow consumes; the dispatch
  routing must cleanly separate card-checkout settlements from VA transfers,
  e.g. by `transaction.type`/`aliasAccountType` absence + orderMetaData
  presence, WITHOUT disturbing the existing payment_success VA path). Route
  primarily by
  `orderMetaData.kind` (Nomba returns orderMetaData in webhook payloads);
  fall back to `orderReference` prefixes. **In every settlement, capture
  Nomba's transaction id into `ChargeAttempt.nombaTransactionId`** — refunds
  are impossible without it.
- Enrollment settlement (`cardenroll_*`): extract `tokenKey` (+ card
  last4/type if present) → upsert SavedCard, set membership
  `autoDebitEnabled = true`, mark the enrollment attempt SUCCESS, and apply
  the payment as a contribution through the shared matcher (same
  transactional block as orphan replay — extract that block from the admin
  resolve route into a shared helper rather than duplicating a third copy;
  it belongs next to the matcher, e.g. `packages/db` stays pure, so put the
  Prisma-applying helper in `apps/web/lib/reconciliation/apply.ts` and have
  web webhook + card flows use it; admin keeps its own copy or imports are
  restructured — implementer's call, but NO third duplicate).
- Verification settlement (`cardverify_*`): extract `tokenKey` → create the
  SavedCard (bind to the recorded membership if the attempt has one; Settings
  path binds nothing); mark the attempt SUCCESS with `refundStatus: PENDING`;
  then call `refundCheckoutTransaction` for the ₦50 (best-effort — on success
  set REFUNDED + refundedAt; on failure set refundStatus FAILED and let the
  sweep retry). The ₦50 is NEVER applied to any pot/contribution/buffer — it
  is not member savings, it's a verification hold being returned.
- Charge settlement (`cardchg_*`): mark attempt SUCCESS/FAILED; on success
  apply via the same helper (creates an InboundTransfer-equivalent record —
  create an InboundTransfer row with `providerEventId = "cardchg_..."` and
  matchStatus MANUAL? No — decide: card charges are not VA transfers; cleanest
  is a nullable `virtualAccountId` OR a `source` discriminator. RECOMMENDED:
  add `source String @default("VA_TRANSFER")` to InboundTransfer with value
  `"CARD"` for card charges and make `virtualAccountId` optional in a
  follow-up migration; the member transactions feed then shows card
  contributions with zero extra work.)
- Failure events: mark FAILED + failureReason, card-expiry mapping, notify.

### Stage 4 — Debit sweep cron
- `POST /api/cron/card-debit-sweep` (CRON_SECRET bearer, same pattern as the
  others) + **add it to `publicApiRoutes` in `apps/web/proxy.ts`** (the
  orphan-spool 401 taught us this).
- Logic: for each cycle in OPEN/COLLECTING joined to memberships with
  `autoDebitCardId` set and that card ACTIVE: compute `remainingDue`; apply
  the eligibility predicate (section above); create ChargeAttempt (PENDING)
  and call `chargeTokenizedCard` with `amount = remainingDue`. Per-member
  try/catch so one failure doesn't abort the sweep (orphan-spool pattern).
- Also in the same sweep: for PENDING attempts older than 30 min, call
  `verifyCheckoutTransaction` and settle them (webhook-missed backstop).
- And: retry `refundCheckoutTransaction` for attempts with
  `refundStatus: FAILED` (max 3 refund retries, then leave FAILED — it's
  indexed, so an admin view can pick stragglers up later; also send
  ourselves a console.error so it shows in logs).
- Railway trigger (daily or 6-hourly):
  `curl -X POST https://www.stashup.xyz/api/cron/card-debit-sweep -H "authorization: Bearer $CRON_SECRET"`
- Tests are the heart of this stage — cover the CORE RULE explicitly:
  - fully-paid-by-transfer after a failed attempt → sweep creates NOTHING
  - partial transfer (owes 4k of 10k) → attempt for exactly 4k
  - buffer-covered cycle (contribution COMPLETE at open) → no attempt
  - PENDING in flight → no second attempt
  - backoff not elapsed → no attempt; elapsed → attempt with recomputed amount
  - MAX_ATTEMPTS exhausted → no attempt
  - cycle READY_TO_PAYOUT/PAID_OUT → no attempt

### Stage 5 — Notifications + polish
- Notifications: charge succeeded ("₦X auto-saved to {circle}"), charge failed
  (reason + "fund by transfer or retry"), card expired ("update your card").
  Email on final-attempt failure only (avoid spam).
- Member transactions feed: card contributions appear (via the InboundTransfer
  `source` discriminator from stage 3).
- Admin: ChargeAttempt visibility can wait (v2) — note it, don't build.

## Compliance / safety notes
- We never store or log PAN/CVV/tokenKey values (tokenKey stored in DB but
  excluded from every log line and API response).
- Charging is server-initiated debiting of a user's card — the enrollment UI
  must state the recurring mandate plainly ("Your card will be charged your
  contribution amount each cycle until you turn this off") and removal must be
  one click. Persist consent timestamp (SavedCard.createdAt suffices for v1).
- All amounts kobo `Int` internally; naira only at the Nomba boundary.

## Open questions (only ONE remains)
1. **Stage 3:** the exact `payment_success` payload shape for a CARD/checkout
   settlement — specifically WHERE `tokenKey`, `orderReference`/
   `orderMetaData`, and `transactionId` sit in `data.transaction` for card
   payments (the doc's sample is a VA transfer). Capture one real event in
   sandbox before wiring dispatch. Also confirm on the dashboard whether a
   separate order/checkout event type exists (`order_success` appears in the
   replay API's enum) and subscribe to whatever fires for checkout.

## Answered (2026-07-04 — do not re-ask)
- **Refunds net out processing fees** → we inform the customer in the UI
  copy (see Path C); no top-up from us.
- **Tokenization is enabled** on this account. ✔
- **`order.accountId` accepts the sub-account id** — card money lands in the
  sub-account wallet. ✔
- **No strict minimum charge** (≥ ₦1 works) — ₦50 verification amount stands.
- **Webhook events/retries/signature** — see "Webhook facts" section above;
  signature scheme matches the existing verify.ts implementation unchanged.
- Sweep cadence: Railway function; owner will set the schedule when the
  endpoint ships (same pattern as orphan-spool).
- Contribution charges: charge exactly `remainingDue`; Nomba's processing fee
  comes out of the platform wallet (v1 default — revisit if fees bite).

## Decisions already made (2026-07-04 — do not re-ask)
- Attempt amounts are ALWAYS the live remaining balance (core rule above);
  a completed cycle payment cancels retries; partial payment shrinks the next
  attempt to the remainder.
- Card rail first (tokenized checkout), bank direct-debit mandates deferred.
- Cards are a user-level LIST (many per user); auto-debit is an explicit
  per-circle binding to ONE chosen card (`Membership.autoDebitCardId`). A new
  circle never debits any card until the member links one. A card added
  during a circle's enrollment joins the list but binds to that circle only.
- Enrollment charge (new-card path) doubles as the current cycle's
  contribution; linking an existing card triggers an immediate charge for the
  current `remainingDue` when > 0.
- Cards can be added at ANY time — mid-cycle, paid up, or with no circle at
  all (Settings). When there's no contribution to collect, tokenization runs
  via a **₦50 verification charge that is refunded** immediately after
  successful tokenization (Nomba refund-checkout-transaction endpoint —
  confirmed to exist). The ₦50 never touches a pot or buffer.

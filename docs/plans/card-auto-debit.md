# Card Auto-Debit ("Auto-save") — Implementation Plan

Members save a card once; StashUp automatically collects their contribution
each cycle by charging the tokenized card. Written to be executed by an LLM
agent with no prior context. **Read `CLAUDE.md` first** — API-route pattern,
money-in-kobo, `tx: Prisma.TransactionClient` typing, and the gate
(`pnpm --filter web typecheck && pnpm --filter web lint &&
pnpm --filter web test`) are non-negotiable.

## Nomba rails (verified against developer.nomba.com)

- **Enroll/tokenize:** create a checkout order (`POST /v1/checkout/order`) with
  `tokenizeCard: true`. Nomba hosts the card form + OTP/3DS (we never touch the
  PAN — no PCI scope). After payment, the **webhook returns a `tokenKey`**.
- **Charge later:** `POST /v1/checkout/tokenized-card-payment` with an `order`
  object (`orderReference`, `customerId`, `amount` — **naira**, `currency:
  "NGN"`, `accountId`, `callbackUrl`, `customerEmail`) + `tokenKey`.
- **Manage:** list/update/delete tokenized cards under
  `/nomba-api-reference/online-checkout/*-tokenized-card-data`.
- Docs say: "Always verify the transaction after charging a tokenized card"
  (webhook + Verify Transactions endpoint as backstop).
- Existing client patterns live in `apps/web/lib/nomba-client.ts`
  (`nombaFetch` = bearer token + `accountId` header; zod-parse `data`;
  descriptive errors on unexpected envelopes).

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
  cycleId        String
  cycle          Cycle               @relation(fields: [cycleId], references: [id])
  membershipId   String
  membership     Membership          @relation(fields: [membershipId], references: [id])
  savedCardId    String
  amountMinor    Int                  // the remainingDue that was charged (kobo)
  orderReference String              @unique  // "cardchg_{cycleId}_{membershipId}_a{attemptNumber}"
  attemptNumber  Int                  // 1..MAX_ATTEMPTS per (cycle, membership)
  status         ChargeAttemptStatus @default(PENDING)
  failureReason  String?
  createdAt      DateTime            @default(now())
  settledAt      DateTime?

  @@unique([cycleId, membershipId, attemptNumber])
  @@index([status, createdAt])
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
- `nomba-client.ts`:
  - `createCheckoutOrder({ orderReference, customerId, customerEmail, amountMinor, callbackUrl, tokenizeCard })`
    → returns the hosted checkout link (`checkoutLink` per docs — verify the
    exact response field name against
    `/nomba-api-reference/online-checkout/create-an-online-checkout-order.md`
    when implementing). Convert kobo → naira at the boundary.
  - `chargeTokenizedCard({ orderReference, customerId, customerEmail, amountMinor, tokenKey })`
    → POST `/v1/checkout/tokenized-card-payment`. NEVER log tokenKey.
  - `deleteTokenizedCard(...)` per the delete-tokenized-card-data endpoint.
  - `verifyCheckoutTransaction(orderReference)` — Verify Transactions endpoint
    (used by the reconcile sweep for stuck PENDING attempts).

### Stage 2 — Enrollment flow (web): two paths per circle
Enabling auto-save on a circle presents the user's card list + "Add new card".

**Path A — link an existing saved card (no checkout):**
- `POST /api/circles/[id]/auto-debit` body `{ savedCardId }`. Guards: circle
  member; card belongs to the requesting user and is ACTIVE. Sets
  `membership.autoDebitCardId`. If the current cycle is OPEN/COLLECTING and
  `remainingDue > 0`, immediately create a ChargeAttempt and charge (snappy
  UX; otherwise the next sweep handles it).
- `DELETE /api/circles/[id]/auto-debit` — unbind this circle only.

**Path B — add a NEW card (tokenizing checkout):**
- `POST /api/cards/enroll` body `{ circleId }`. Guards: member of circle,
  cycle OPEN/COLLECTING, `remainingDue > 0` (the enrollment charge IS the
  current contribution — no wasted charge; if paid up, reject with "you're
  paid up — link this card from your card list next cycle, or add it in
  Settings"). Creates checkout order with `tokenizeCard: true`,
  `orderReference = "cardenroll_{cycleId}_{membershipId}"`, PENDING
  ChargeAttempt (attemptNumber 0 = enrollment), returns the checkout link.
  On webhook settlement: create the SavedCard in the user's list AND bind it
  to THIS membership only.
- Optional Settings variant (add a card without a circle): defer to v2 unless
  trivially cheap — the circle-scoped flow covers the launch need.

**Card management (user-level):**
- `GET /api/cards` — the user's card list (id/last4/brand/status + which
  circles each is bound to).
- `DELETE /api/cards/[id]` — revoke: Nomba token delete, status REVOKED,
  null `autoDebitCardId` on all bound memberships.
- UI: "Auto-save" block in circle detail (card picker + add-new → checkout
  redirect); Settings "Saved cards" section (list, bindings, remove). Follow
  existing feature/mutation patterns; typed wrappers in `lib/api/data/cards/`.

### Stage 3 — Webhook handling (dispatch.ts)
- **First verify the real event name/shape** for checkout + tokenized-card
  payments (docs don't pin it; likely `payment_success` with order fields —
  inspect a sandbox webhook or the webhook doc page). Route by presence of
  our `orderReference` prefixes.
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

## Open questions (ask the owner before the affected stage)
1. **Stage 3:** exact webhook event type/payload for checkout + tokenized
   charges on this account — capture one in sandbox before wiring dispatch.
2. **Stage 2:** is card tokenization enabled on the account tier? (Some Nomba
   features require support enablement.) Test `tokenizeCard: true` in sandbox
   first.
3. **Stage 4 cadence:** daily vs 6-hourly sweep (Railway function — owner
   creates the trigger).
4. Charge fees: who bears Nomba's card MDR — absorb or pass on? (Affects
   whether we charge `remainingDue` or `remainingDue + fee`; v1 assumption:
   absorb, charge exactly `remainingDue`.)

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

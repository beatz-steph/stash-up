# Sprint 4 — Contributions & Reconciliation (money-in)

**Goal:** wire the webhook dispatch (Sprint 1 stub) so inbound bank transfers into members' VAs
become **Contributions**, drive the cycle toward payout, and route anything that can't be
auto-matched into the **reconciliation queue**. Highest-risk money logic — test it hard.

**Prerequisites:** Sprints 1 (webhook spine) + 3 (VAs + open cycle). **Blocks:** Sprint 5.

> Models: `InboundTransfer` (`matchStatus: MATCHED|OVERPAID|UNDERPAID|UNMATCHED|MANUAL`),
> `Contribution` (`amountMinor`, `status: PENDING|PARTIAL|COMPLETE|DEFAULTED`), `Cycle`
> (`potCollectedMinor`, `status`), `Membership.bufferMinor`.

---

## A. Reconciliation engine (pure function — `lib/reconciliation/match.ts`, TDD-first)
Given a parsed inbound transfer (`aliasAccountReference`, `transactionAmount × 100` = kobo) and
DB context, decide the match:
1. Resolve `VirtualAccount` by `accountRef == aliasAccountReference` → `Membership`. None →
   `UNMATCHED`.
2. Find the member's **open/collecting cycle** contribution row (upsert `Contribution` on
   `(cycleId, membershipId)`).
3. Compare cumulative paid vs `contributionMinor`:
   - exact / completes the due amount → `MATCHED`, contribution `COMPLETE`.
   - less than due → `UNDERPAID`, contribution `PARTIAL`.
   - more than due → `OVERPAID`, excess into `Membership.bufferMinor` (or flagged), contribution
     `COMPLETE`.
4. Return the decision + the mutations to apply (don't mutate inside the matcher — return intent
   so it's unit-testable).

## B. Webhook business handler (fills the Sprint 1 dispatch)
On `event_type = payment_success`:
- Run the matcher, then **inside `prisma.$transaction`**: persist `InboundTransfer`, apply the
  contribution upsert, increment `Cycle.potCollectedMinor`, and re-evaluate cycle status:
  - `potCollectedMinor >= potExpectedMinor` → `READY_TO_PAYOUT`.
  - else stays `COLLECTING` (first contribution flips `OPEN`→`COLLECTING`).
- Always 200 (webhook contract).

### B1. ⚠️ MUST FIX the Sprint 1 dedup hazard before real dispatch runs here
The Sprint 1 receiver dedups on **"seen"** (Redis `claimWebhookEvent`) *before* dispatch, and
returns 500 if dispatch throws. That combination loses money: claim succeeds → receipt
inserted → dispatch throws → 500 → Nomba retries → **the Redis claim already exists → deduped →
200 → dispatch never re-runs → the payment is silently dropped.** It's harmless in Sprint 1
only because dispatch is a no-op stub. Here dispatch moves real money, so dedup must key on
**completion, not first sight.**

Required change to `app/api/webhooks/nomba/route.ts` (+ tests):
1. Insert `WebhookReceipt` with `processed: false` (the model already has `processed`,
   `processedAt`, `processingError`).
2. Run dispatch **inside** its own try; on success set `processed: true`, `processedAt: now()`;
   on failure set `processingError` and return non-200 **without** leaving a dedup that blocks
   reprocessing.
3. The dedup gate must allow re-processing an **unprocessed** receipt on retry. Either:
   - drop the Redis claim and dedup via the DB receipt — `findUnique(provider, requestId)`:
     exists & `processed` → 200 stop; exists & not processed → re-dispatch; absent → insert +
     dispatch (catch `P2002` for the concurrent-delivery race); **or**
   - keep the Redis claim but **release it** (`DEL`) when dispatch fails.
4. Dispatch itself must be **idempotent** (it already relies on DB constraints: `Contribution`
   `@@unique(cycleId, membershipId)`, and Sprint 5's `Payout.cycleId @unique`), so a re-delivery
   that partially applied can't double-count.
5. Tests: dispatch throws → receipt stays `processed:false` + non-200; **retry of the same
   `requestId` re-runs dispatch** and lands `processed:true`; a genuinely-completed event is not
   reprocessed; concurrent duplicate (`P2002`) is handled.
6. Runbook (`docs/runbooks/webhook-failures.md`): document finding + replaying
   `processed:false` receipts.

## C. Deadline / default sweep (`app/api/cron/cycle-sweep/route.ts` or a server action)
- For cycles past `deadline` not fully collected → `AWAITING_RESOLUTION`; mark missing
  contributions `DEFAULTED`; increment `Membership.defaultCount` + `User.lifetimeDefaultCount`.
- Trigger via Vercel Cron (documented) or an admin-invokable endpoint. Keep the logic pure +
  tested; the route just calls it.

## D. Frontend (tested)
- Circle detail: per-member contribution status for the current cycle (paid/partial/pending/
  defaulted), pot progress bar (`potCollectedMinor / potExpectedMinor` as ₦), deadline countdown.
- Notification on contribution received (reuse `createNotification`).

## E. TDD / tests (money-critical — required, not optional)
- **Matcher unit tests:** unknown VA → UNMATCHED; exact → MATCHED/COMPLETE; underpay → UNDERPAID/
  PARTIAL; overpay → OVERPAID + buffer; second payment completing a PARTIAL; payment to a member
  with no open cycle.
- **Webhook handler:** updates pot + flips to READY_TO_PAYOUT at threshold; transaction rolls
  back on error. **Dedup-on-completion (B1):** a completed event re-delivered → no-op; a
  dispatch failure leaves the receipt `processed:false` and **re-delivery reprocesses it**;
  concurrent duplicate handled.
- **Sweep:** overdue cycle → AWAITING_RESOLUTION + defaults counted.
- **Frontend:** contribution states + pot progress render from fixtures.

## F. Documentation
- `docs/features/contributions-reconciliation.md` — the matcher rules, cycle state transitions,
  default handling.
- `docs/runbooks/reconciliation.md` — what UNMATCHED/OVER/UNDER mean and how an operator
  resolves them (links to Sprint 8 admin action).

## G. Acceptance criteria
- [ ] Inbound transfers create/upsert contributions correctly for all match outcomes (tested).
- [ ] Cycle advances to READY_TO_PAYOUT exactly when the pot is met; webhook idempotent +
      transactional.
- [ ] **Dedup hazard fixed (B1):** dedup keys on `processed`, dispatch failures are retryable,
      no payment can be silently dropped — covered by tests.
- [ ] Overdue cycles + defaults handled by the sweep. UNMATCHED/OVER/UNDER land in the queue.
- [ ] Docs + typecheck/lint/tests green.

## H. Out of scope
The actual payout (Sprint 5). Admin resolution UI (Sprint 8) — just produce the queue data.

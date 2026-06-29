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
On `eventType` = inbound payment (verify exact name against Nomba):
- Run the matcher, then **inside `prisma.$transaction`**: persist `InboundTransfer`, apply the
  contribution upsert, increment `Cycle.potCollectedMinor`, and re-evaluate cycle status:
  - `potCollectedMinor >= potExpectedMinor` → `READY_TO_PAYOUT`.
  - else stays `COLLECTING` (first contribution flips `OPEN`→`COLLECTING`).
- Always 200 (webhook contract). Idempotent per `requestId` (already deduped in Sprint 1).

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
- **Webhook handler:** updates pot + flips to READY_TO_PAYOUT at threshold; duplicate event
  no-ops; transaction rolls back on error.
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
- [ ] Overdue cycles + defaults handled by the sweep. UNMATCHED/OVER/UNDER land in the queue.
- [ ] Docs + typecheck/lint/tests green.

## H. Out of scope
The actual payout (Sprint 5). Admin resolution UI (Sprint 8) — just produce the queue data.

# StashUp — Delivery Roadmap (to completion)

Master plan for finishing StashUp. Each sprint has its own detailed handoff file under
[`docs/plans/sprints/`](./sprints). Implementation goes to Gemini; each sprint is reviewed
against its **Acceptance Criteria** before the next starts.

> Deadline: 11:59 PM WAT, 7 July 2026. Sprints are **dependency-ordered work packages**, not
> week-long blocks — compress aggressively. The member happy-path demo is the critical path
> (Sprints 0–6); admin (7–8) and hardening (9) follow.

---

## 1. Where we are

**Done**
- Web: auth + onboarding (sign-up/in, email verify, reset, withdrawal-account gate), analytics
  (PostHog), in-app notifications, design system (`su-`), API architecture.
- Admin: Phase 1 (shell, dashboard metrics, auth, seed, access control, audit).
- DB: **schema is complete** (`packages/db/prisma/business.prisma`) — Circle, CircleInvite,
  Membership, VirtualAccount, Cycle, Contribution, InboundTransfer, Payout, WebhookReceipt,
  NombaConfig, AdminAuditLog, WithdrawalAccount.
- Infra: `lib/nomba-client.ts` (OAuth token issue/refresh + `createVirtualAccount`,
  `initiateSubAccountBankTransfer`, `getSubAccountBalance`); `lib/redis.ts`
  (`claimWebhookEvent` dedup, `acquirePayoutLock`).

**Not built yet:** circle/cycle/contribution/payout endpoints + UI, the Nomba **webhook
handler**, reconciliation, the payout engine, the **rewritten member dashboard**, admin
Phase 2–3, **any tests**, and the **documentation system**.

## 2. The two cross-cutting mandates

These apply to **every** sprint (part of Definition of Done), not a one-time task.

### Testing
- **Stack:** Vitest + `@testing-library/react` + `@testing-library/user-event` + `jsdom`,
  MSW for HTTP mocking. (Decision — override before Sprint 0 if you disagree.)
- **Frontend tests are mandatory.** Every form, hook, and meaningful component/flow ships with
  tests (rendering, validation, success/error states, gated UI).
- **TDD for endpoints.** For each route handler, write the DTO contract, then a failing route
  test (401/403/400/happy-path/business-rules with `auth`/`prisma`/`nomba`/`redis` mocked),
  then implement to green. See the TDD loop in §4.
- **Money-critical logic** (reconciliation matcher, payout idempotency, cycle state machine):
  extract into pure functions and unit-test them — **strongly recommended even though deep
  backend testing is otherwise optional.**
- **Never hit real Nomba/Redis/DB in tests** — mock them.
- Co-locate `*.test.ts(x)` next to source. Scripts: `pnpm --filter <app> test` (+ `:watch`),
  root `pnpm test`. See [`docs/testing.md`](../testing.md) (created in Sprint 0).

### Documentation (self-documenting, beginning to end)
- Markdown under `/docs`, established in Sprint 0:
  - `docs/README.md` — index.
  - `docs/architecture/` — system overview, data model, auth, money flow, Nomba integration;
    `docs/architecture/adr/NNNN-*.md` for decisions.
  - `docs/features/` — one file per feature.
  - `docs/api/` — endpoint reference (one table per route group; DTO zod schemas are the
    source of truth).
  - `docs/runbooks/` — webhook failures, payout retry, reconciliation, deploy, env reference.
  - `docs/testing.md`.
- **Rule:** a sprint is not done until its features/endpoints are documented and the relevant
  `docs/` pages updated. Exported functions and DTOs carry JSDoc. Sprint 0 also
  **back-documents already-built features**.

## 3. Sprint roadmap

| # | Sprint | Outcome | Depends on |
|---|--------|---------|-----------|
| 0 | [Foundations](./sprints/sprint-0-foundations.md) | Test tooling + docs system live; existing features documented | — |
| 1 | [Nomba integration + webhook spine](./sprints/sprint-1-nomba-and-webhooks.md) | Hardened Nomba client + name enquiry; webhook route with verify/dedup/200 | 0 |
| 2 | [Circle creation & membership](./sprints/sprint-2-circles-and-membership.md) | Create circle, invite by username, accept/decline/leave, list/detail | 0,1 |
| 3 | [Activation & VA provisioning](./sprints/sprint-3-activation-and-virtual-accounts.md) | Activate full circle → VA per member, first cycle opens | 1,2 |
| 4 | [Contributions & reconciliation](./sprints/sprint-4-contributions-and-reconciliation.md) | Webhook matches inbound transfers → contributions; cycle progresses | 1,3 |
| 5 | [Payout engine](./sprints/sprint-5-payout-engine.md) | Pot complete → auto payout to recipient; rotation + defaults | 1,4 |
| 6 | [Web dashboard rewrite](./sprints/sprint-6-web-dashboard-rewrite.md) | Scrap old dashboard; real member home + circle UX | 2–5 |
| 7 | [Admin read views](./sprints/sprint-7-admin-read-views.md) | Users, circles, reconciliation, payouts, webhooks, audit | 4,5 |
| 8 | [Admin operator actions](./sprints/sprint-8-admin-operator-actions.md) | Block user, resolve transfer, retry payout, config — audited | 7 |
| 9 | [Hardening, E2E, docs, deploy](./sprints/sprint-9-hardening-and-launch.md) | Security audit, E2E happy path, docs complete, Vercel deploy | all |

## 4. TDD loop for endpoints (every backend route)
1. Write/extend the DTO (`app/api/<area>/dto/*.dto.ts`) — request + response zod schemas.
2. Write the failing route test (`route.test.ts`): unauthorized (401), forbidden if gated
   (403), invalid body (400), happy path (200 + response shape), and each business rule.
   Mock `@/lib/auth`, `@workspace/db`, `@/lib/nomba-client`, `@/lib/redis`.
3. Implement the handler until green.
4. Refactor; extract money/state logic into pure, separately-tested functions.
5. Add the typed `lib/api/data/*` wrapper (with response schema) + React Query hook + a
   frontend test.

## 5. Global Definition of Done (applies to every sprint)
- `pnpm --filter <app> typecheck` and `lint` clean for all touched apps.
- All tests required by the sprint written and green; money-critical logic covered.
- `docs/` updated for the sprint's features + endpoints; JSDoc on new exports.
- Absolute Rules honored: `prisma` only in `app/api/**`+backend libs; money in kobo (Int);
  no PII/secret logging; **webhook safety** (raw body → dedup → verify → txn → always 200);
  **payout safety** (unique `cycleId`, status check in txn, `merchantTxRef` idempotency,
  `acquirePayoutLock`).
- Reviewed against the sprint's Acceptance Criteria.

## 6. Review process (per sprint)
Gemini implements a sprint → you review the diff against that sprint file's **Acceptance
Criteria** + the Global DoD → request changes or accept → commit → next sprint. Each sprint
file's Acceptance Criteria section is your review checklist.

## 7. Critical-path & risk notes
- **Nomba sandbox is the biggest unknown.** Sprint 1 must prove real VA creation + transfer +
  webhook signature against the sandbox early; everything downstream depends on it.
- **Money correctness > feature breadth.** Reconciliation (S4) and payout idempotency (S5) are
  the highest-risk areas — that's where the strongly-recommended backend tests live.
- If time runs short, ship the **member happy path (0–6)** end-to-end before admin polish.

# Sprint 3 — Circle Activation & Virtual Account Provisioning

**Goal:** when a circle's slots are full, the creator activates it: provision a **Nomba virtual
account per member**, open the first cycle, and lock the rotation. This is the first real
money-infrastructure step.

**Prerequisites:** Sprints 1 (Nomba client) + 2 (circles). **Blocks:** Sprint 4.

> Models: `Membership.vaProvisionStatus (PENDING|PROVISIONED|FAILED)`, `VirtualAccount`
> (`accountRef = "membership_{membershipId}"`, unique), `Cycle`, `Circle.currentCycleSeq`.

---

## A. Endpoints (TDD)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/api/circles/[id]/activate` | `requireCircleCreator`, circle `FORMING` **and full** | Provision a VA per active membership; on success set circle `ACTIVE`, open Cycle #1, set recipient to `payoutPosition=1`. |
| GET | `/api/circles/[id]/virtual-accounts` | `requireCircleMember` | Each member's VA bank details (the member sees **their own** funding account). |
| POST | `/api/circles/[id]/provisioning/retry` | creator | Retry VAs for memberships stuck at `FAILED`. |

## B. Activation logic (extract → testable pure orchestration where possible)
For each `Membership` (status `ACTIVE`):
1. Call `createVirtualAccount` (Nomba) with `accountRef = "membership_{membershipId}"`
   (idempotent key — re-runs must not double-create).
2. On success → persist `VirtualAccount` (bank number/name/bank/code, providerAccountRef),
   set `vaProvisionStatus = PROVISIONED`.
3. On failure → `vaProvisionStatus = FAILED`; **do not** flip the circle to `ACTIVE` until all
   memberships are `PROVISIONED`.
4. When all provisioned: `Circle.status = ACTIVE`, `currentCycleSeq = 1`, create `Cycle`
   (`sequence=1`, `recipientMembershipId` = position 1, `potExpectedMinor = contributionMinor ×
   activeMembers`, `deadline` from `Frequency`, status `OPEN`).
   Wrap the circle/cycle flip in `prisma.$transaction`.

**Idempotency:** activation must be safe to retry — provisioned members are skipped (the
`accountRef`/`membershipId @unique` on `VirtualAccount` enforces no duplicates).

## C. Frontend (tested)
- Activation panel in circle detail (creator only, enabled when full). Progress/again on
  partial failure.
- "Fund your circle" view: the member's own VA number/bank, copy-to-clipboard, the amount due
  (`contributionMinor` as ₦), the current cycle + recipient.

## D. TDD / tests
- **Endpoint:** not-full → 400; non-creator → 403; happy path provisions all + opens cycle;
  partial Nomba failure → some `FAILED`, circle stays `FORMING`, retry completes it; re-activate
  is idempotent (no duplicate VAs/cycles). Mock `nomba-client`/`prisma`.
- **Pure logic:** `potExpectedMinor` calc; deadline-from-frequency; "all provisioned?" check.
- **Frontend:** activation button gating; VA details render; retry visible only on FAILED.

## E. Documentation
- `docs/features/circles.md` — add activation + VA provisioning section + failure handling.
- `docs/architecture/money-flow.md` — VA-per-member funding model.
- `docs/runbooks/` — "VA provisioning failed" triage.

## F. Acceptance criteria
- [ ] Activation provisions one VA per member, idempotently; circle only goes `ACTIVE` when all
      succeed; Cycle #1 opens with correct pot/deadline/recipient.
- [ ] Members can see their own funding VA; amounts in ₦.
- [ ] Retry path works; covered by tests. Docs + typecheck/lint/tests green.

## G. Out of scope
Inbound contribution matching (Sprint 4), payouts (Sprint 5).

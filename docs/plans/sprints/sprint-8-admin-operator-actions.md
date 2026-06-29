# Sprint 8 — Admin Phase 3: Operator Actions

**Goal:** the high-stakes operator writes — block/unblock users, resolve unmatched transfers,
retry failed payouts, toggle Nomba config — each `SUPER_ADMIN`-only and **audited**. This is
where the reconciliation queue and failed payouts actually get fixed.

**Prerequisites:** Sprint 7 (read views), Sprints 4–5 (the data + the matcher/payout logic).
**Blocks:** Sprint 9.

> Every write: `requireSuperAdmin` → `validateRequestBody` → mutate in `$transaction` →
> `recordAudit(...)` → return. Reuse `lib/audit.ts`, `lib/access-control.ts`.

---

## A. Endpoints (TDD)

| Method | Path | Action | Audit |
|---|---|---|---|
| POST | `/api/users/[id]/block` | set `User.blockedFromCircles` (body `{ blocked }`) | `USER_BLOCKED` / `USER_UNBLOCKED` |
| POST | `/api/reconciliation/[id]/resolve` | set `InboundTransfer.matchStatus = MANUAL`; optionally link `matchedCycleId`/`matchedMembershipId` and apply the contribution it should have matched (reuse Sprint 4 matcher intent) | `TRANSFER_RESOLVED` (before/after in metadata) |
| POST | `/api/payouts/[id]/retry` | re-trigger the **existing** payout path via `merchantTxRef` (idempotent); if engine unavailable, record intent only | `PAYOUT_RETRY_REQUESTED` |
| POST | `/api/config/status` | flip `NombaConfig.status` (ACTIVE↔INVALID); never touch ciphers | `NOMBA_CONFIG_TOGGLED` |

**Safety:** payout retry MUST reuse `merchantTxRef = "payout_{cycleId}"` and the Sprint 5
idempotency guards — a retry can never double-pay. Resolving a transfer must update the cycle
pot consistently (in a transaction) if it applies a contribution.

## B. Frontend (tested)
- Action buttons on the relevant detail/queue rows, **visible only to SUPER_ADMIN**, with
  confirm dialogs (`@workspace/ui` AlertDialog). Optimistic/refetch on success; toast on result.
- Reconciliation resolve form (pick cycle/member to attribute), block toggle, payout retry
  confirm, config toggle.

## C. TDD / tests
- **Endpoints:** SUPPORT → 403 on every write; invalid body → 400; happy path mutates +
  **creates an `AdminAuditLog` row**; payout retry reuses the idempotency key and never creates
  a second `Payout`; transfer resolve updates pot in a transaction.
- **Frontend:** write controls hidden for SUPPORT; confirm dialogs gate the action; success
  refetches the list.

## D. Documentation
- `docs/features/admin.md` — each action, who can do it, what it audits, the safety notes.
- `docs/runbooks/reconciliation.md` + `payout-retry.md` — the exact operator steps, now backed
  by real actions.

## E. Acceptance criteria
- [ ] All four actions work, `SUPER_ADMIN`-gated (UI + route), each writes an audit row (tested).
- [ ] Payout retry is idempotent (no double-pay); transfer resolve is transactional.
- [ ] `NombaConfig` ciphers never touched/exposed. Docs + typecheck/lint/tests green.

## F. Out of scope
New financial flows beyond retry/resolve. No web app changes.

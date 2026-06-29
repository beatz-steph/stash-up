# Sprint 7 — Admin Phase 2: Read Views

**Goal:** give operators visibility into the now-live data: users, circles, the reconciliation
queue, payouts, webhooks, and the audit log. Read-only; any authenticated admin.

**Prerequisites:** Sprints 4–5 (data exists), admin Phase 1 (shell + metrics). **Blocks:**
Sprint 8.

> Build in `apps/admin` using the established pattern (route + DTO + `validateRequestBody` not
> needed for GETs + typed `lib/api/data/*` + React Query). Money in ₦. Never expose
> `NombaConfig` secrets. Reuse the `su-` admin shell + `SidebarNav` (links already exist).

---

## A. Endpoints (TDD) + pages

| Page | Endpoint | Shows |
|---|---|---|
| `/users`, `/users/[id]` | `GET /api/users`, `GET /api/users/[id]` | Searchable users; detail: profile, withdrawal account (masked), memberships, `lifetimeDefaultCount`, `blockedFromCircles`. |
| `/circles`, `/circles/[id]` | `GET /api/circles`, `GET /api/circles/[id]` | Filter by status; detail: members (position/status), cycles, contributions, payouts, VA status. |
| `/reconciliation` | `GET /api/reconciliation` | `InboundTransfer` where `matchStatus != MATCHED`, newest first — the exception queue. |
| `/payouts` | `GET /api/payouts` | Filter by status; surface `FAILED` + `failureReason`. |
| `/webhooks` | `GET /api/webhooks` | `WebhookReceipt`: eventType, signatureValid, processed, processingError. |
| `/audit` | `GET /api/audit` | `AdminAuditLog`, newest first, with actor. |
| `/settings` | `GET /api/config` (SUPER_ADMIN) | `NombaConfig` **status + masked** info only. |

Add pagination (cursor or page/limit) to the list endpoints; document the convention.

## B. Frontend (tested)
- Tables using `@workspace/ui` (Table, Badge), `su-` styling, empty states. Detail pages reuse
  Card patterns. Filters/search as client state → query params.

## C. TDD / tests
- **Endpoints:** 401 unauth; correct shape; filters/pagination work; `/config` returns masked
  data and 403 for SUPPORT.
- **Frontend:** list renders rows from fixtures; filters update query; reconciliation/payout/
  webhook "attention" rows highlighted; SUPPORT cannot see Settings (nav + route).

## D. Documentation
- `docs/features/admin.md` — expand with each read view, what it's for, the data source.
- `docs/api/` — admin route groups + the pagination convention.

## E. Acceptance criteria
- [ ] All six read views render real data with pagination/filtering; tested.
- [ ] `NombaConfig` secrets never leave the server; `/settings` gated to SUPER_ADMIN.
- [ ] SUPPORT vs SUPER_ADMIN visibility enforced (UI + route). Docs + typecheck/lint/tests green.

## F. Out of scope
Write actions (Sprint 8). No changes to web app or money logic.

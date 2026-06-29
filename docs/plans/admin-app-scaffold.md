# Execution Plan — Scaffold the StashUp Admin App

> Handoff spec for an implementing agent (Gemini). Self-contained: assume no prior
> conversation context. **Use `apps/web` as the architectural template**, minus analytics
> and notifications. **No hallucination**: only use Prisma models/fields that actually exist
> in `packages/db/prisma/*.prisma` (listed below). Reason about a real ROSCA operator's job.

---

## 0. What this app IS (real-world framing — read first)

StashUp is a digital **Ajo/Esusu** platform: rotating savings circles where members
contribute on a schedule and take turns receiving the pooled payout, with money moving
through **Nomba virtual accounts** (no human holding cash).

`apps/admin` is the **platform operator's back office / control room**. Its real job:

1. **Oversight** — see the health of the platform: users, circles, cycles, and the money
   flow (contributions in, payouts out).
2. **Exception handling** — money that arrived but **could not be auto-matched** to a
   member/cycle (wrong amount, off-cycle, unknown account) lands in a **reconciliation
   queue** an operator must resolve, or members' contributions stay stuck. **Failed payouts**
   (a Nomba transfer to a member's bank that didn't go through) must be investigated.
3. **Trust & safety** — block members who repeatedly default or abuse the system.
4. **Accountability** — every operator action is **audit-logged** (who did what, when).

It is **read-heavy** with a **small set of high-stakes, role-gated, audited write actions**.
Admins are **provisioned, not self-signup** (there is a `/login` only — no register).

**Two roles** (`AdminRole`): `SUPER_ADMIN` (full access incl. financial/destructive actions
and config) and `SUPPORT` (read + low-risk assist). Enforce this.

---

## 1. Architecture — copy from `apps/web`, drop analytics + notifications

The web app already established the pattern. **Read these web files as the reference and
port them into `apps/admin` (adapting imports):**

- `apps/web/lib/api/client.ts` → `apps/admin/lib/api/client.ts` (typed `api.get/post(path, schema?, options?)`, Zod response validation)
- `apps/web/lib/api/server.ts` → `apps/admin/lib/api/server.ts` (`serverApiOptions()` — forwards cookie + origin for Server Components)
- `apps/web/lib/api/validate.ts` → `apps/admin/lib/api/validate.ts` (`validateRequestBody(request, schema)`)
- `apps/web/components/providers.tsx` → already exists in admin; ensure it provides the React Query client.

**The rule (same as web):** `app/api/**` is a standalone backend. Every data read/write goes
through an API route handler. The ONLY exception is BetterAuth (`auth.api.*` / `authClient.*`).
- `prisma` imported **only** in `app/api/**` and backend libs routes import (`lib/access-control.ts`).
- **Never** import `prisma` in components, `features/*`, or `lib/api/data/*`.
- Server Components fetch via `lib/api/data/*` wrappers with `await serverApiOptions()`.
- Client Components use React Query hooks in `features/<area>/queries|mutations/*`.
- DTOs live beside their route: `app/api/<area>/dto/*.dto.ts` (Zod schemas + inferred types).
  **DTOs are client-safe → import only `zod`, never `@workspace/db`.**
- Toasts: `import { toast } from "@workspace/ui/components/sonner"`.
- Money: stored as **kobo** (`amountMinor: Int`). Display as `₦{(amountMinor/100).toLocaleString()}`. Never show raw kobo.
- No `as any`.

**DO NOT port (explicitly excluded):**
- `lib/analytics/*`, `instrumentation-client.ts`, `components/posthog-identify.tsx`, any PostHog wiring.
- `lib/notifications.ts`, `features/notifications/*`, the notification bell.
- The web `Notification`/onboarding/withdrawal features.

The admin app has **no PostHog and no in-app notifications.**

---

## 2. Fix what's already broken in `apps/admin` (do this first)

The current admin scaffold has the same bugs the web app already fixed:

1. **Broken resolver version.** `apps/admin/package.json` pins `@hookform/resolvers@^3.10.0`,
   which throws a raw `ZodError` at runtime with Zod v4. **Bump to `^5.4.0`** (web uses this).
2. **Inline error divs.** `apps/admin/app/(auth)/login/page.tsx` shows `{error && <div>…}`.
   Replace the `useState` error + inline div with **`toast.error(...)`** (matches web).
3. **2FA is half-wired.** `apps/admin/lib/auth.ts` enables the `twoFactor()` plugin, but the UI
   has no 2FA step. For the hackathon, **leave password-only login working**; do NOT invent a
   2FA flow. Leave a `// TODO(2fa)` note. (Don't remove the plugin.)

Keep the admin's existing **dark "control-room" aesthetic** (slate-950 background, purple/
indigo accents) — but build it with `@workspace/ui` components. The `su-` tokens are
available if useful; visual identity stays dark/admin, distinct from the member app.

---

## 3. Auth & access control (admin-specific)

The admin BetterAuth instance is in `apps/admin/lib/auth.ts` (`AdminUser`, `AdminSession`,
`role` with default `SUPPORT`, `twoFactor`). **Two separate BetterAuth instances share one DB
— never import the web auth here.**

Session guard in every protected route handler:
```ts
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
const session = await auth.api.getSession({ headers: await headers() })
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
```

Create `apps/admin/lib/access-control.ts` (backend lib, server-only):
```ts
// Pseudocode — implement against the real session shape (session.user.role).
// requireAdmin(session): throws/returns 401 if no session.
// requireSuperAdmin(session): 403 unless session.user.role === "SUPER_ADMIN".
```
- **Read** endpoints: any authenticated admin (`SUPPORT` or `SUPER_ADMIN`).
- **Write / financial / destructive** endpoints (block user, resolve transfer, retry payout,
  toggle config): **`SUPER_ADMIN` only**.

Server Components / pages: `getSession`; if null → `redirect("/login")`.

---

## 4. Audit logging (mandatory for every write)

The `AdminAuditLog` model already exists (`packages/db/prisma/business.prisma`):
`{ id, adminUserId, action, entityType?, entityId?, metadata? (Json), createdAt }`.

Create `apps/admin/lib/audit.ts` (server-only):
```ts
// recordAudit({ adminUserId, action, entityType?, entityId?, metadata? })
// → prisma.adminAuditLog.create(...). Never throws into the caller.
```
**Every write action route calls `recordAudit` after the mutation succeeds.** Example actions:
`USER_BLOCKED`, `USER_UNBLOCKED`, `TRANSFER_RESOLVED`, `PAYOUT_RETRY_REQUESTED`,
`NOMBA_CONFIG_TOGGLED`. Put non-PII context in `metadata` (ids, before/after status) — never
tokens/secrets.

---

## 5. The data the admin operates on (existing models ONLY — do not invent)

From `packages/db/prisma/business.prisma` (read it; use exact field names):

- **User** (in `auth.prisma`): `id, name, email, username, firstName, lastName, emailVerified,
  blockedFromCircles (Boolean), lifetimeDefaultCount (Int)`, relations to `memberships`,
  `withdrawalAccount`.
- **Circle**: `id, name, contributionMinor, currency, frequency, status (CircleStatus:
  FORMING|ACTIVE|COMPLETED|CANCELLED), cancelledReason, totalSlots, startDeadline,
  currentCycleSeq, createdByUserId`, relations `memberships`, `cycles`, `invites`.
- **Membership**: `role (CREATOR|MEMBER), payoutPosition, status (MemberStatus: ACTIVE|
  SUSPENDED|DEFAULTED|LEFT), vaProvisionStatus, bufferMinor, defaultCount`, relations
  `virtualAccount`, `contributions`, `payoutsReceived`.
- **Cycle**: `sequence, status (CycleStatus: OPEN|COLLECTING|AWAITING_RESOLUTION|
  READY_TO_PAYOUT|PAYOUT_INITIATED|PAID_OUT|CLOSED|CANCELLED), potExpectedMinor,
  potCollectedMinor, deadline, recipientMembershipId`.
- **Contribution**: `amountMinor, status (PENDING|PARTIAL|COMPLETE|DEFAULTED)`.
- **InboundTransfer**: `amountMinor, matchStatus (MatchStatus: MATCHED|OVERPAID|UNDERPAID|
  UNMATCHED|MANUAL), matchedCycleId?, matchedMembershipId?, senderName?, narration?,
  aliasAccountRef, receivedAt`. **`matchStatus != MATCHED` = the reconciliation queue.**
- **Payout**: `amountMinor, status (PayoutStatus: INITIATED|PENDING_BILLING|SUCCESS|FAILED|
  REFUNDED), failureReason?, recipientAccountNumber, recipientBankName, merchantTxRef,
  nombaTransferId?, cycleId (unique)`.
- **WebhookReceipt**: `provider, providerEventId, eventType, signatureValid, processed,
  processedAt?, processingError?, createdAt`.
- **NombaConfig**: `provider, status (ACTIVE|INVALID), baseUrl, createdAt`. **NEVER expose
  `clientSecretCipher` / `webhookSecretCipher` — return status + masked metadata only.**
- **AdminAuditLog**: see §4.

> Reality check: the member-side circle/cycle/payout engine is still being built, so several
> tables (Cycle, Contribution, Payout, InboundTransfer) may be **empty** until that runs. That
> is expected — the admin app **reads whatever exists** and renders empty states. Do NOT seed
> fake business data and do NOT build features for fields that don't exist.

---

## 6. Build phases

### Phase 1 — Foundation + shell + dashboard (must-have scaffold)
1. Port `lib/api/{client,server,validate}.ts`; ensure `providers.tsx` wraps React Query.
2. Fix the three issues in §2.
3. `lib/access-control.ts` (§3) + `lib/audit.ts` (§4).
4. **App shell**: an authenticated layout with a left **sidebar nav** (Dashboard, Users,
   Circles, Reconciliation, Payouts, Webhooks, Audit, Settings) + topbar showing the admin's
   name/role + sign-out. Dark control-room styling. Nav items requiring `SUPER_ADMIN` are
   hidden for `SUPPORT`.
5. **Dashboard** `/` + `GET /api/metrics`: real platform metrics computed from existing tables
   (use `prisma.*.count` / `aggregate`), e.g.:
   - total users; users blocked from circles
   - circles by status (FORMING/ACTIVE/COMPLETED/CANCELLED)
   - cycles by status; **count of cycles in `AWAITING_RESOLUTION`** (needs attention)
   - **count of `InboundTransfer` where `matchStatus != MATCHED`** (reconciliation backlog)
   - **count of `Payout` where `status = FAILED`** (needs attention)
   - total collected = `sum(Cycle.potCollectedMinor)` (or `sum(Contribution.amountMinor where COMPLETE)`), shown in ₦
   Render "needs attention" tiles prominently (reconciliation backlog, failed payouts,
   awaiting-resolution cycles) — that's the operator's daily triage.
6. **Admin provisioning**: there is no signup. Add a **seed/bootstrap** path to create the
   first `SUPER_ADMIN` (email + password + role) via the admin BetterAuth server API (e.g. a
   `apps/admin` script or a `packages/db` seed). Document the command in the admin README.
   Do not expose a public register route.

### Phase 2 — Read views (oversight)
For each: a list page + `GET` route (+ DTO, data wrapper, query hook), and a detail page where
it makes sense. All read-only, any authenticated admin.
- **Users** `/users`, `/users/[id]`: searchable list; detail shows profile, withdrawal account
  (masked acct number), memberships, `lifetimeDefaultCount`, `blockedFromCircles`.
- **Circles** `/circles`, `/circles/[id]`: filter by status; detail shows members (with
  `payoutPosition`, `status`), cycles, contributions, payouts, VA provisioning status.
- **Reconciliation** `/reconciliation` + `GET /api/reconciliation`: `InboundTransfer` where
  `matchStatus != MATCHED`, newest first — the exception queue.
- **Payouts** `/payouts`: filter by status, surface `FAILED` with `failureReason`.
- **Webhooks** `/webhooks`: `WebhookReceipt` log (eventType, signatureValid, processed,
  processingError).
- **Audit** `/audit`: `AdminAuditLog`, newest first.
- **Settings** `/settings` (SUPER_ADMIN): `NombaConfig` status (masked), platform info.

### Phase 3 — Operator write actions (SUPER_ADMIN only, each audited)
Each: `POST` route → `requireSuperAdmin` → validate body → mutate → `recordAudit` → return.
- **Block / unblock user** `POST /api/users/[id]/block` (body `{ blocked: boolean }`) →
  set `User.blockedFromCircles`. Audit `USER_BLOCKED`/`USER_UNBLOCKED`.
- **Resolve a transfer** `POST /api/reconciliation/[id]/resolve` → set
  `InboundTransfer.matchStatus = MANUAL` and (optionally) link `matchedCycleId` /
  `matchedMembershipId` from the body. Audit `TRANSFER_RESOLVED` with before/after in metadata.
- **Retry a failed payout** `POST /api/payouts/[id]/retry`: **Honest scoping** — the actual
  Nomba transfer retry belongs to the member-side payout engine, which may not exist yet. So
  this action should **mark the payout for retry / record the operator's intent + audit
  (`PAYOUT_RETRY_REQUESTED`)**, and call the real payout-retry function **only if it already
  exists**. Do NOT invent a Nomba API call here. Leave a clear `// TODO` pointing at the future
  engine.
- **Toggle Nomba config** `POST /api/config/status` → flip `NombaConfig.status`
  (ACTIVE↔INVALID). Audit `NOMBA_CONFIG_TOGGLED`. Never touch the cipher fields.

---

## 7. Acceptance criteria
- `pnpm --filter admin typecheck` and `pnpm --filter admin lint` pass (0 errors).
- No `@workspace/db` import in any `"use client"` file, in `features/*`, or in `lib/api/data/*`.
- No PostHog, no notifications anywhere in `apps/admin`.
- A `SUPPORT` admin can view all read pages but **cannot** see/call any Phase-3 write action
  (UI hidden + route returns 403).
- Every Phase-3 write creates an `AdminAuditLog` row.
- Dashboard renders real counts from the DB (empty states where tables are empty — no fake data).
- A first `SUPER_ADMIN` can be created via the documented seed/bootstrap and can log in.
- All money shown as ₦, never raw kobo. `NombaConfig` secrets never leave the server.

## 8. Out of scope / do NOT
- No analytics, no in-app notifications.
- No public admin registration.
- Do not invent Prisma fields, enums, or Nomba endpoints — use only what exists in
  `packages/db/prisma/*.prisma`. If something needs the unbuilt member engine, stub with a
  clear `// TODO` rather than fabricating it.
- Do not modify `apps/web`.
- Do not expose `NombaConfig` secret/cipher fields.

## 9. Suggested file layout (mirror web)
```
apps/admin/
  lib/api/{client,server,validate}.ts
  lib/api/data/{metrics,users,circles,reconciliation,payouts,webhooks,audit,config}/index.ts
  lib/access-control.ts
  lib/audit.ts
  app/(dashboard)/layout.tsx            # app shell: sidebar + topbar, session-guarded
  app/(dashboard)/page.tsx              # dashboard
  app/(dashboard)/{users,circles,reconciliation,payouts,webhooks,audit,settings}/...
  app/api/metrics/route.ts
  app/api/users/route.ts
  app/api/users/[id]/route.ts
  app/api/users/[id]/block/route.ts
  app/api/circles/route.ts
  app/api/circles/[id]/route.ts
  app/api/reconciliation/route.ts
  app/api/reconciliation/[id]/resolve/route.ts
  app/api/payouts/route.ts
  app/api/payouts/[id]/retry/route.ts
  app/api/webhooks/route.ts
  app/api/audit/route.ts
  app/api/config/route.ts
  app/api/config/status/route.ts
  app/api/<area>/dto/*.dto.ts
  features/<area>/queries|mutations/*.ts
```
```
```

# CLAUDE.md — StashUp (Ajo/Esusu Digital Thrift App)

## Project Overview

**StashUp** is a digital Ajo/Esusu platform (rotating savings circle / ROSCA) built on Nomba Virtual Accounts for the Nomba × DevCareer Hackathon 2026.

**Stack:** Two full-stack Next.js 15 apps (App Router), Neon PostgreSQL, Prisma 7, BetterAuth, Vercel. No separate backend service — API routes and server actions live inside each Next.js app.

**Deadline:** 11:59 PM WAT, 7 July 2026.

---

## Agent Team

| Agent | Role | Trigger |
|-------|------|---------|
| `tech-lead` | Orchestrator — decomposes, delegates, reviews. Also owns schema/DB design. | Complex/cross-cutting tasks, ambiguous requirements, full feature builds, schema changes |
| `backend-engineer` | Next.js API routes, server actions, Prisma queries, business logic | Route handlers, server actions, webhook handler, reconciliation engine, payout logic |
| `frontend-engineer` | Next.js client UI — features, forms, mutations, queries, components | Feature folders, forms, tables, client components, React Query hooks |
| `qa-engineer` | Testing + security review | Business logic tests, security review of routes/actions, access control audits |

### Routing Rules

- "Build the webhook handler" → `backend-engineer`
- "Build the circle dashboard UI" → `frontend-engineer`
- "Write tests for reconciliation" → `qa-engineer`
- "Build circle creation end-to-end (schema + API + UI)" → `tech-lead`
- "Is this server action secure?" → `qa-engineer`

---

## Architecture

Two full-stack Next.js apps sharing one Prisma DB package and one UI package. **No NestJS. No separate backend service.**

```
stashup/
├── apps/
│   ├── web/           — Next.js member/user app (port 3000) — full-stack
│   └── admin/         — Next.js admin panel (port 3001) — full-stack
├── packages/
│   ├── db/            — Shared Prisma client + all schema files
│   └── ui/            — Shared shadcn/ui components
├── package.json
└── pnpm-workspace.yaml
```

### Data Layer

```
packages/db/prisma/
├── schema.prisma        — generator + datasource (prismaSchemaFolder)
├── auth.prisma          — BetterAuth user tables
├── admin-auth.prisma    — BetterAuth admin tables (admin_ prefix)
└── business.prisma      — application domain
```

Import everywhere server-side: `import { prisma } from "@workspace/db"`

### Auth Architecture

Two BetterAuth instances, one shared database.

| App | Auth file | Tables |
|-----|-----------|--------|
| `apps/web` | `apps/web/lib/auth.ts` | `user`, `session`, `account`, `verification` |
| `apps/admin` | `apps/admin/lib/auth.ts` | `admin_user`, `admin_session`, `admin_account`, `admin_verification` |

**Never mix auth clients across apps.**

---

## API Pattern — API Routes Are the Backend

Treat `app/api/**` as a standalone backend service that will later be extracted to its
own deployment. **Every data read and write goes through an API route handler.** The
ONLY exception is BetterAuth's server helpers (`auth.api.*`), which may be called directly.

1. **Route Handlers** (`app/api/*/route.ts`) own ALL Prisma access + business logic,
   each guarded by a session check (plus verification/circle guards as needed).
2. **Server Components** exist only to render the initial UI faster. They fetch from the
   API routes over HTTP via the typed client in `lib/api/*` (`await serverApiOptions()`
   forwards the session cookie + absolute origin). They do NOT import Prisma or business logic.
3. **Client Components** call the same `lib/api/*` wrappers through React Query.
4. **Server Actions are NOT used for data access** — prefer route handlers so the backend
   stays portable.

**`prisma` is imported ONLY inside `app/api/**`** (and shared backend libs that routes
import, e.g. `lib/access-control.ts`). Never in components, `features/*`, or `lib/api/*`.

### Session Helper (use in every protected route/action)

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({ headers: await headers() });
if (!session) redirect("/sign-in");
const userId = session.user.id;
```

### Access Control Pattern (Circle-Based — Not Multi-Tenant)

```typescript
// Verify the requesting user is a member of the circle
async function requireCircleMember(circleId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { circleId_userId: { circleId, userId } },
  });
  if (!membership) throw new Error("Not a circle member");
  return membership;
}

async function requireCircleCreator(circleId: string, userId: string) {
  const membership = await requireCircleMember(circleId, userId);
  if (membership.role !== "CREATOR") throw new Error("Not the circle creator");
  return membership;
}
```

There is NO `requireTenantAccess` — this is not a multi-tenant SaaS.

---

## Frontend Data Fetching

All data flows through the typed API client in `lib/api/*` (never raw `fetch` with
string URLs, never Prisma in the UI layer).

- **Server Components:** `await serverApiOptions()` then call a typed wrapper
  (e.g. `fetchOnboardingStatus(opts)`) — forwards the session cookie + absolute origin.
- **Client Components:** React Query `useQuery` / `useMutation` calling the same typed
  wrappers (same-origin, cookies sent automatically).
- **Auth forms:** use the BetterAuth client directly (`authClient.signIn.email`, etc.) —
  `useState` for loading/error is acceptable here only.
- **NEVER** import `prisma` in a component, `features/*`, or `lib/api/*`.
- **NEVER** use raw `fetch` with string URLs in feature code — add a typed wrapper in `lib/api/*`.

---

## Absolute Rules (All Agents)

1. **NEVER** import `prisma` in a `"use client"` file — server-side only
2. **NEVER** use `as any` — fix types properly
3. **NEVER** edit `packages/db/generated/*` — change schema and regenerate
4. **NEVER** import toast from `sonner` directly — always from `@workspace/ui/components/sonner`
5. **NEVER** skip circle membership/creator checks on circle-scoped operations
6. **ALWAYS** store monetary amounts as `Int` in kobo — never `Float`
7. **ALWAYS** run `pnpm typecheck` and `pnpm lint` after changes
8. **NEVER** log PII, tokens, webhook secrets, or session tokens

---

## Money Rules

- Internal storage: **kobo** (`Int`) — ₦10,000 = `1000000`
- Nomba API (outbound): full Naira — `amount = minorAmount / 100`
- Nomba webhook (inbound): `transactionAmount` × 100 → kobo
- UI display: `₦10,000.00` — never expose raw kobo integers

---

## Nomba Webhook Safety

Order is mandatory:
1. Capture raw body (disable body parser — use `req.text()`)
2. Dedup: `INSERT WebhookReceipt` on `(provider, providerEventId)` — duplicate → 200 OK stop
3. Verify the `nomba-signature` header: HmacSHA256 (Base64) of the colon-joined string
   `{event_type}:{requestId}:{userId}:{walletId}:{transactionId}:{type}:{time}:{responseCode}:{nomba-timestamp}`
   (fields from `data.merchant.*`/`data.transaction.*` + the `nomba-timestamp` header) keyed by
   `NOMBA_SIGNATURE_KEY` (dashboard "signature key"). Compare timing-safe. NOT a raw-body HMAC.
4. Business logic inside `prisma.$transaction()`
5. Always return 200 — Nomba retries on non-200

## Payout Safety (Non-Negotiable — 3 Layers)

1. `Payout.cycleId @unique` DB constraint
2. `SELECT FOR UPDATE` equivalent: read cycle status inside `$transaction`, abort if already `PAYOUT_INITIATED`
3. `merchantTxRef = "payout_${cycleId}"` sent to Nomba as idempotency key

---

## Workflow Commands

```bash
# From packages/db/
npx prisma migrate dev --name <description>
npx prisma generate

# Root
pnpm dev          # starts all apps
pnpm typecheck
pnpm lint
```

---

## Environment Variables

```
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
ADMIN_BETTER_AUTH_SECRET=
ADMIN_BETTER_AUTH_URL=http://localhost:3001
NOMBA_CLIENT_ID=
NOMBA_CLIENT_SECRET=
NOMBA_ACCOUNT_ID=
NOMBA_SUB_ACCOUNT_ID=
NOMBA_SIGNATURE_KEY=
NOMBA_BASE_URL=https://api.nomba.com
RESEND_API_KEY=
```

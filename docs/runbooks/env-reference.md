# Environment Reference

All environment variables used by the workspace. Each app (`apps/web`, `apps/admin`)
has its own `.env` locally and its own env set per Vercel project. `.env*` is gitignored.

## Shared (both apps)

| Var | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | Same DB for both apps (shared Prisma schema). |
| `REDIS_URL` | Redis connection (Upstash in prod) | Required — payout lock + webhook dedup **fail closed** if unreachable. |
| `NODE_ENV` | `development` / `production` | — |

## Auth (BetterAuth)

| Var | App | Purpose |
|---|---|---|
| `BETTER_AUTH_SECRET` | web **and** admin | Session signing secret. Each app / Vercel project sets its **own** value — they must be **distinct** so a web session is never valid on admin (separate BetterAuth instances). The admin app reads `BETTER_AUTH_SECRET` (BetterAuth's default var name), scoped to its own project. |
| `BETTER_AUTH_URL` | web (`:3000`) / admin (`:3001`) | Canonical origin per app. |
| `NEXT_PUBLIC_ADMIN_BETTER_AUTH_URL` | admin | Client-side admin origin. |

## Nomba (apps/web)

| Var | Purpose |
|---|---|
| `NOMBA_CLIENT_ID` | OAuth client id (Nomba dashboard). |
| `NOMBA_CLIENT_SECRET` | OAuth client secret — **issued by Nomba**; rotate only via the Nomba dashboard, never fabricate locally. |
| `NOMBA_ACCOUNT_ID` | Nomba account id (sent as `accountId` header). |
| `NOMBA_SUB_ACCOUNT_ID` | Sub-account used for VA creation + transfers. |
| `NOMBA_SIGNATURE_KEY` | Webhook signature key (dashboard "signature key") — HMAC-SHA256 verification. |
| `NOMBA_BASE_URL` | `https://api.nomba.com` (or sandbox base). |

## Cron (apps/web)

| Var | Purpose |
|---|---|
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/*` (sweeps, payouts, `/api/cron/reconciliation`). Must be set on the web project or those routes return 401. |

Schedule the nightly treasury reconciliation against `GET /api/cron/reconciliation` (Bearer `CRON_SECRET`), alongside the existing `webhook-replay`, `orphan-spool`, `payout-sweep`, and `cycle-sweep` crons.

## Reconciliation proxy (apps/admin)

The admin app has **no Nomba client**, so its treasury-reconciliation "Run" button proxies to the web app's reconciliation endpoint.

| Var | Purpose |
|---|---|
| `WEB_APP_URL` | Origin of `apps/web` (e.g. `http://localhost:3000` / the deployed web URL). Admin calls `${WEB_APP_URL}/api/cron/reconciliation`. Falls back to `NEXT_PUBLIC_APP_URL` then localhost. |
| `CRON_SECRET` | Same shared secret as the web project — admin sends it as the Bearer to authenticate the reconciliation proxy. |

## Email / Analytics

| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | Transactional email (verification). |
| `RESEND_FROM_EMAIL` | From address for Resend. |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | PostHog analytics (client). |

> Money-safety note: `NombaConfig.status = INVALID` (admin toggle) disables payouts + VA
> provisioning at the DB level, independent of these env vars. A missing config row does **not**
> disable the integration (fail-open) — see `apps/web/lib/nomba-config.ts`.

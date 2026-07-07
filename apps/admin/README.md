# StashUp Admin

Platform operator control room for StashUp (Ajo/Esusu savings circles). Oversight of
users, circles, cycles, the money flow (contributions in, payouts out), the reconciliation
queue, and an audit trail of admin actions.

Separate Next.js app from `apps/web`, with its own BetterAuth instance (`admin_*` tables)
and `SUPER_ADMIN` / `SUPPORT` roles. Runs on **port 3001**.

## Setup

1. Create `apps/admin/.env` from the example and fill it in:
   ```bash
   cp .env.example .env
   ```
   At minimum you need `DATABASE_URL` (same Neon DB as the rest of the monorepo),
   `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL=http://localhost:3001`.

2. Provision the first admin. Admins are **never self-registered** (public sign-up is
   disabled) — create one with the seed script:
   ```bash
   pnpm --filter admin seed <email> <password> "Full Name"
   # e.g.
   pnpm --filter admin seed admin@stashup.xyz 'StrongPass123!' "Platform Admin"
   ```
   This creates a `SUPER_ADMIN`. Requires Node 20+ (the seed uses `--env-file`).

3. Run the dev server (binds to 3001):
   ```bash
   pnpm --filter admin dev
   ```
   Sign in at http://localhost:3001/login.

## Architecture

Mirrors `apps/web`: `app/api/**` is the backend (every data read/write goes through a
route handler; `prisma` only imported there + in backend libs). Server Components fetch via
the typed client in `lib/api/*` using `serverApiOptions()`. No analytics, no notifications.

- `lib/access-control.ts` — `requireAdmin` / `requireSuperAdmin` guards.
- `lib/audit.ts` — `recordAudit`, called by every write action.
- `scripts/seed.ts` — provision a `SUPER_ADMIN`.

## Related Documentation

- **[Root Repository README](../../README.md)**
- **[User Web App (`apps/web`)](../web/README.md)**
- **[Technical Documentation Hub](../../docs/README.md)**

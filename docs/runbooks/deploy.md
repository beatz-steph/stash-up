# Deployment Runbook

This runbook covers the steps for deploying the StashUp platform to Vercel, including the `web` and `admin` apps, Redis provisioning, database migrations, and initial seeding.

## 1. Prerequisites
- A Vercel account linked to the GitHub repository.
- A Neon Database (Postgres) instance for production.
- An Upstash Redis instance (serverless Redis) for payout locking and webhook deduplication.
- Nomba production credentials (or rotated sandbox credentials).

## 2. Vercel Project Setup
You must create **two separate projects** in Vercel, pointing to the same repository but with different root directories or build commands depending on the monorepo setup (Turborepo is used here).

### Web App (`apps/web`)
1. Create a new Vercel project, root directory `apps/web` (or root with framework preset Next.js and build command `cd ../.. && npx turbo run build --filter=web`).
2. Set the following environment variables:
   - `DATABASE_URL`: Production DB connection string.
   - `REDIS_URL`: Upstash Redis connection string.
   - `NOMBA_BASE_URL`: Nomba API base URL.
   - `NOMBA_CLIENT_ID`: Nomba Client ID.
   - `NOMBA_CLIENT_SECRET`: Nomba Client Secret.
   - `NOMBA_ACCOUNT_ID`: Nomba Account ID.
   - `NOMBA_SUB_ACCOUNT_ID`: Nomba Sub Account ID.
   - `NOMBA_SIGNATURE_KEY`: Nomba Webhook Signature Key.
   - `BETTER_AUTH_SECRET`: A secure random string.
   - `CRON_SECRET`: A secure random string used to authenticate Vercel cron jobs.
3. Configure `vercel.json` (already present in the repo) for the cron jobs, ensuring `CRON_SECRET` matches the env var.

### Admin App (`apps/admin`)
1. Create a second Vercel project, root directory `apps/admin` (or root with framework preset Next.js and build command `cd ../.. && npx turbo run build --filter=admin`).
2. Set the following environment variables:
   - `DATABASE_URL`: Production DB connection string.
   - `REDIS_URL`: Upstash Redis connection string.
   - `NOMBA_BASE_URL`: (Optional if admin only reads data, but required for NombaConfig UI).
   - `BETTER_AUTH_SECRET`: A secure random string. This MUST be named `BETTER_AUTH_SECRET` in Vercel for the Admin app, but conceptually it is distinct from the Web app's secret so users cannot share sessions between web and admin. (i.e. `ADMIN_BETTER_AUTH_SECRET`).

## 3. Database Migrations
Migrations are not automatically run on Vercel deployment unless configured in the build command.
1. Locally or via a CI step, run:
   ```bash
   npx prisma migrate deploy
   ```
   against the production database to ensure the schema is up to date.

## 4. Admin Seeding
To access the Admin dashboard, you need a `SUPER_ADMIN` account.
1. Locally, configure your `.env` with the production `DATABASE_URL`.
2. Run the seeding script:
   ```bash
   pnpm --filter admin seed
   ```
   or `npx tsx apps/admin/scripts/seed.ts`
3. This will create a default super admin (or you can specify credentials in the script).

## 5. Scheduled Jobs (Railway cron functions)

Cron triggers run as **Railway cloud functions**, not Vercel crons (`vercel.json`
crons were intentionally removed). Each just POSTs the endpoint with the
`CRON_SECRET` bearer. Create one Railway function per job:

| Endpoint | Suggested schedule | Purpose |
|----------|-------------------|---------|
| `/api/cron/payout-sweep` | every ~5 min | Initiate payouts for `READY_TO_PAYOUT` cycles |
| `/api/cron/cycle-sweep` | hourly | Close/advance cycles past deadline |
| `/api/cron/card-debit-sweep` | hourly | Collect auto-save contributions (wallet → card) |
| `/api/cron/orphan-spool` | every ~6 h | Spool VA credits with no webhook into the recon queue |
| `/api/cron/webhook-replay` | every ~1 h | Ask Nomba to re-push failed/uncertain webhooks (recovery backstop) |

```bash
curl -X POST https://www.stashup.xyz/api/cron/webhook-replay \
  -H "authorization: Bearer $CRON_SECRET"
```

`webhook-replay` asks Nomba to redeliver any `PAYMENT_*` / `PAYOUT_*` event whose
delivery to us failed or is uncertain in the last 6 h (override with `?hours=`).
Nomba re-sends them correctly signed; our WebhookReceipt/business idempotency
makes duplicate deliveries safe, so it's safe to run frequently. It self-heals:
once an event is delivered it leaves the replay filter and stops being re-pushed.

## 6. Post-Deploy Smoke Test
1. Access the web app, register an account, and confirm email sending (if configured).
2. Access the admin app, log in with the seeded `SUPER_ADMIN` credentials.
3. Verify Redis connection by triggering a webhook and checking the deduplication logs (ensure it doesn't fall back to DB).
4. Verify Nomba credentials by triggering a test webhook from the Nomba Dashboard and ensuring a 200 OK response.

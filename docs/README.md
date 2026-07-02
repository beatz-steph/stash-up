# StashUp

StashUp is a digital Ajo/Esusu savings circle platform. It consists of two Next.js 15 applications (`apps/web` and `apps/admin`) backed by Prisma and a Postgres database.

## Quickstart

### 1. Installation
Ensure you have `pnpm` installed.
```bash
pnpm install
```

### 2. Environment Variables
Create a `.env` file in the root based on the provided examples. You will need:
- Postgres `DATABASE_URL` (Neon or local)
- Redis `REDIS_URL` (Upstash or local)
- Nomba sandbox credentials
- Two distinct auth secrets (`BETTER_AUTH_SECRET`, `ADMIN_BETTER_AUTH_SECRET`)

See [Environment Reference](./runbooks/env-reference.md) for details.

### 3. Database Setup & Seeding
```bash
npx prisma migrate dev
pnpm --filter admin seed
```
This applies migrations and creates the `SUPER_ADMIN` user for the admin dashboard.

### 4. Running the Apps
Start the Turborepo development server to run both apps simultaneously:
```bash
pnpm dev
```
- Web App: `http://localhost:3000`
- Admin App: `http://localhost:3001`

### 5. Running Tests
The project uses Vitest for testing.
```bash
pnpm test
```

## Documentation Directory

### Architecture
- [System Overview](./architecture/system-overview.md)
- [Data Model](./architecture/data-model.md)

### Features
- [Authentication & Onboarding](./features/auth-onboarding.md)
- [Circles (Core Engine)](./features/circles.md)
- [Admin Dashboard](./features/admin.md)

### Runbooks
- [E2E Happy Path](./runbooks/e2e-happy-path.md)
- [Deployment Guide](./runbooks/deploy.md)
- [Reconciliation Flow](./runbooks/reconciliation.md)
- [Payout Retry](./runbooks/payout-retry.md)
- [Environment Reference](./runbooks/env-reference.md)

### API
- [Webhook Endpoint](./api/webhooks.md)
- [REST API Structure](./api/README.md)

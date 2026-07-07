# StashUp Database (`@workspace/db`)

This package manages the shared Prisma database layer for the entire StashUp monorepo. It exports a typed Prisma Client that is consumed by both `apps/web` and `apps/admin`.

## Overview

The database is built on PostgreSQL and divided into three logical schema files:
1. `auth.prisma`: Manages BetterAuth tables for the consumer web app.
2. `admin.prisma`: Manages BetterAuth tables for the internal admin dashboard (isolated from consumers).
3. `business.prisma`: Manages the core StashUp business logic (Circles, Memberships, Cycles, Wallets, Webhooks, Reconciliation, etc.).

## Setup & Commands

Ensure you have a `.env` file at the root of the monorepo with your `DATABASE_URL`.

```bash
# Apply schema changes and generate the Prisma Client
npx prisma migrate dev

# Push schema directly without creating migration files (for quick prototyping)
npx prisma db push

# Generate the Prisma Client
npx prisma generate
```

## Seeding Data
StashUp uses dedicated seed scripts to quickly set up environments.

To seed the Super Admin user for the `apps/admin` dashboard, run this from the root of the project:
```bash
pnpm --filter admin seed "admin@stashup.xyz" "StrongPass123!" "Platform Admin"
```

## Related Documentation

- **[Root Repository README](../../README.md)**
- **[Data Model Architecture](../../docs/architecture/data-model.md)**
- **[Technical Documentation Hub](../../docs/README.md)**

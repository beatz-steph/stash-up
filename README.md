# StashUp

StashUp is a digital Ajo/Esusu savings circle platform built for trust, transparency, and automation. It allows groups of users to pool their money and take turns receiving payouts, leveraging automated card/wallet deductions and payouts powered by the Nomba API.

This repository is a Next.js 15 Turborepo monorepo encompassing the core user-facing web app, an admin control room, a shared Postgres database powered by Prisma, and a shared UI component library.

## Directory of Documentation

To help navigate this monorepo, each app, package, and core architecture component has its own dedicated documentation:

### 📱 Applications
- **[Web App (`apps/web`)](./apps/web/README.md)**: The core user-facing application where users sign up, join savings circles, fund their wallets, and view their payouts. Runs on port 3000.
- **[Admin App (`apps/admin`)](./apps/admin/README.md)**: The internal platform operator control room. Used to oversee users, manage stuck reconciliation queues, and view global treasury metrics. Runs on port 3001.

### 📦 Packages
- **[Database (`packages/db`)](./packages/db/README.md)**: Contains the Prisma schema, migrations, and database seeding scripts.
- **[UI Components (`packages/ui`)](./packages/ui/README.md)**: A shared library of [shadcn/ui](https://ui.shadcn.com/) components used by both the Web and Admin apps.
- **[ESLint Config (`packages/eslint-config`)](./packages/eslint-config/README.md)**: Shared linting configurations.
- **[TypeScript Config (`packages/typescript-config`)](./packages/typescript-config/README.md)**: Shared TypeScript compiler configurations.

### 📚 Technical Documentation Hub
Deep-dive architectural, product, and API documentation is located in the `docs` folder.

- **[Documentation Hub (`docs/README.md`)](./docs/README.md)**
  - **Architecture**: [System Overview](./docs/architecture/system-overview.md) | [Data Model](./docs/architecture/data-model.md)
  - **Features**: [Auth & Onboarding](./docs/features/auth-onboarding.md) | [Savings Circles](./docs/features/circles.md) | [Admin Tools](./docs/features/admin.md)
  - **Runbooks**: [E2E Happy Path](./docs/runbooks/e2e-happy-path.md) | [Deployment](./docs/runbooks/deploy.md) | [Reconciliation](./docs/runbooks/reconciliation.md)
  - **APIs**: [Webhooks](./docs/api/webhooks.md) | [REST APIs](./docs/api/README.md)

## Quickstart

### Prerequisites
- Node.js 20+
- `pnpm` (package manager)
- A local or cloud Postgres database (e.g., Neon)
- A local or cloud Redis instance (e.g., Upstash)

### 1. Installation
Install dependencies across the monorepo:
```bash
pnpm install
```

### 2. Environment Setup
Copy the `.env.example` file to `.env` in the root of the project and fill in the required variables (Database URL, Redis URL, Nomba Sandbox Credentials, Auth Secrets).
```bash
cp .env.example .env
```
*(See the [Environment Reference](./docs/runbooks/env-reference.md) for full details).*

### 3. Database Setup & Seeding
Apply the latest migrations to your Postgres database and seed it with the necessary Admin user.
```bash
npx prisma migrate dev
pnpm --filter admin seed "admin@stashup.xyz" "StrongPass123!" "Platform Admin"
```

### 4. Running the Dev Servers
Use Turborepo to run the Web, Admin, and any other dev scripts simultaneously:
```bash
pnpm dev
```
- **Web**: `http://localhost:3000`
- **Admin**: `http://localhost:3001`

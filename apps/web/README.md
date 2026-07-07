# StashUp Web App

This is the core user-facing application for StashUp, built with Next.js 15 (App Router). It provides the interface for end-users to register, join savings circles, fund their wallets, manage their accounts, and track their payouts.

## Overview

The web app is responsible for the complete user journey and most of the core business logic, including:
- **Authentication**: Powered by [BetterAuth](https://better-auth.com/).
- **Savings Circles**: Creating, joining, and tracking Ajo/Esusu cycles.
- **Wallets & Payments**: Funding wallets and paying circle contributions (via the Nomba API).
- **Webhooks**: Listening to and processing payment events from Nomba.
- **Cron Jobs**: Spooling orphans, executing reconciliation checks, and sweeping cycle payouts.

## Setup & Running

This app relies on the shared `packages/db` and `packages/ui` workspaces. It is designed to be run from the root of the monorepo via Turborepo:

```bash
# Run from the root directory of the monorepo
pnpm --filter web dev
```
The server will start on **`http://localhost:3000`**.

> [!NOTE]
> Ensure you have your `.env` configured at the root of the monorepo before running the app. See the [Environment Reference](../../docs/runbooks/env-reference.md) for details.

## Related Documentation

- **[Root Repository README](../../README.md)**
- **[Admin Dashboard (`apps/admin`)](../admin/README.md)**
- **[Shared Database (`packages/db`)](../../packages/db/README.md)**
- **[Shared UI Components (`packages/ui`)](../../packages/ui/README.md)**
- **[Technical Documentation Hub](../../docs/README.md)**

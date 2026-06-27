# CLAUDE.md — Project Agent Setup

## Project Overview

_Replace this section with your project description._

Multi-service monorepo with NestJS backends, Next.js frontends, Prisma ORM, Better Auth, and auto-generated OpenAPI clients. pnpm workspaces.

## Agent Team

This project uses a specialized multi-agent team. Each agent has deep domain expertise and follows strict conventions.

### Agent Roster

| Agent | Role | Trigger |
|-------|------|---------|
| `tech-lead` | Orchestrator — decomposes, delegates, reviews. Also owns schema/DB design. | Complex/cross-cutting tasks, ambiguous requirements, full feature builds, new models, migrations |
| `backend-engineer` | NestJS services implementation | Modules, endpoints, DTOs, services, business logic, Prisma queries |
| `frontend-engineer` | Next.js apps implementation | Feature folders, forms, tables, queries, mutations, components |
| `qa-engineer` | Testing + security review | Writing tests, fixing broken tests, access control audits, security review |

### Routing Rules

**Single-domain tasks → direct to specialist:**
- "Add a new endpoint" → `backend-engineer`
- "Build a feature table UI" → `frontend-engineer`
- "Write tests for a service" → `qa-engineer`
- "Is this endpoint secure?" → `qa-engineer`
- "Add a DB index" → `tech-lead`
- "Review the code I just wrote" → `qa-engineer`

**Cross-cutting tasks → tech-lead orchestrates:**
- "Build a feature end-to-end" → `tech-lead`
- "I need help but I'm not sure where to start" → `tech-lead`

## Tech Stack

- **Backend:** NestJS 10, Prisma 7, PostgreSQL, Better Auth, class-validator, Swagger
- **Frontend:** Next.js (App Router), React 19, TailwindCSS 4, TanStack Query 5, React Hook Form, Zod
- **Monorepo:** pnpm workspaces

## Monorepo Layout

_Update paths to match your project. The structure below is the expected convention._

```
<project>/
├── apps/<dashboard>/          — Next.js primary app (e.g. admin dashboard)
├── apps/<client>/             — Next.js secondary app (e.g. customer-facing) [optional]
├── services/<api>/            — NestJS primary backend
├── services/<bff>/            — NestJS BFF for secondary app [optional]
├── packages/ui/               — Shared UI components
├── packages/<api>-client/     — Generated OpenAPI client for services/<api>
└── packages/<bff>-client/     — Generated OpenAPI client for services/<bff> [optional]
```

## API Client Mapping

Each frontend app has one dedicated generated client. **Never mix them.**

| Frontend App | API Client Package | Backend Service |
|---|---|---|
| `apps/<dashboard>` | `@workspace/<api>-client` | `services/<api>` |
| `apps/<client>` | `@workspace/<bff>-client` | `services/<bff>` |

_Fill in your actual package names above._

## Absolute Rules (All Agents)

1. **NEVER bypass `requireTenantAccess`** (or equivalent) for tenant-scoped data
2. **NEVER use `as any`** — fix types properly
3. **NEVER edit `generated/prisma/*`** in any service — change schema and regenerate
4. **NEVER import toast from `sonner`** directly — always from `@workspace/ui/components/sonner`
5. **NEVER use raw fetch/axios in features** — use the generated API client via React Query
6. **NEVER return raw Prisma models** — always use response DTOs
7. **NEVER log PII, tokens, or secrets**
8. **NEVER manually edit generated client packages** — run codegen
9. **ALWAYS** run `pnpm typecheck` and `pnpm lint` after changes

## Workflow Commands

```bash
# Schema changes (run from service directory)
npx prisma migrate dev --name <description>
npx prisma generate

# API client regeneration (run once per affected service)
pnpm --filter @workspace/<api>-client codegen
pnpm --filter @workspace/<bff>-client codegen   # if applicable

# Verification
pnpm typecheck
pnpm lint

# Development
pnpm dev
```

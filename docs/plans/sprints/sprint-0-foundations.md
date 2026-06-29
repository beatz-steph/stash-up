# Sprint 0 — Foundations: Test Tooling + Documentation System

**Goal:** stand up the testing stack and the documentation system so every later sprint can
do TDD and self-document. Back-document the already-built features. No product features here.

**Prerequisites:** none. **Blocks:** all other sprints.

---

## A. Testing stack

Install (root + per app as needed): `vitest`, `@vitejs/plugin-react`, `jsdom`,
`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw`.

1. **Vitest config per app** (`apps/web/vitest.config.ts`, `apps/admin/vitest.config.ts`):
   jsdom environment, React plugin, path alias `@/` → app root, setup file.
2. **Setup file** (`test/setup.ts`): import `@testing-library/jest-dom`; start/stop MSW server;
   `afterEach(cleanup)`.
3. **MSW** (`test/msw/`): `server.ts` (node server) + handlers; helpers to stub `lib/api/data/*`
   endpoints.
4. **Mock helpers** (`test/mocks/`): factory helpers to `vi.mock` `@/lib/auth`
   (`getSession`), `@workspace/db` (`prisma`), `@/lib/nomba-client`, `@/lib/redis`. Provide a
   `mockSession(user)` and a typed prisma mock.
5. **Scripts:** add `"test": "vitest run"`, `"test:watch": "vitest"` to each app; root `"test":
   "turbo run test"`.
6. **Reference tests** (prove the harness): one route-handler test (e.g. the existing
   `GET /api/onboarding/status` — 401 vs 200) and one component test (e.g. the web sign-in
   form renders + validates). These are the templates Gemini copies later.

## B. Documentation system

Create the structure and seed it:
- `docs/README.md` — index linking every section; "how this repo documents itself" note.
- `docs/architecture/system-overview.md` — the two-app + shared-DB topology, API-as-backend
  rule, request flow (Server Component → `lib/api/data` → route → prisma).
- `docs/architecture/data-model.md` — the domain models and their relationships (from
  `business.prisma`), the cycle/contribution/payout state machines (enum values), money-in-kobo.
- `docs/architecture/auth.md` — two BetterAuth instances, sessions, roles, onboarding gate.
- `docs/architecture/money-flow.md` — end-to-end naira flow: member → virtual account → cycle
  pot → payout → recipient bank; where kobo conversions happen.
- `docs/architecture/nomba-integration.md` — token mgmt, VA creation, transfers, webhook
  contract (header, fields), the safety order. (Filled out in Sprint 1.)
- `docs/architecture/adr/0001-api-routes-as-backend.md`, `0002-testing-stack.md`,
  `0003-self-documentation.md` — record the decisions already made.
- `docs/features/` — back-document built features: `auth-onboarding.md`, `analytics.md`,
  `notifications.md`, `admin.md` (each: what it does, key files, endpoints, how to test).
- `docs/api/README.md` — endpoint-reference conventions (one table per route group:
  method, path, guard, request DTO, response DTO, errors).
- `docs/runbooks/env-reference.md` — every env var, which app, what it's for.
- `docs/testing.md` — how to run/write tests, the TDD loop, mocking patterns, the reference
  tests' locations.

## C. Tests required
- The two reference tests (A.6) pass.
- `pnpm --filter web test` and `pnpm --filter admin test` run green.

## D. Documentation deliverables
- All files in section B exist and are non-stub (real content, not TODO).
- `docs/README.md` links them all.

## E. Acceptance criteria
- [ ] `pnpm test` (root) runs Vitest across both apps, green.
- [ ] A route-handler test and a component test exist and pass (the templates).
- [ ] MSW + `vi.mock` helpers exist and are documented in `docs/testing.md`.
- [ ] `docs/` structure complete; existing features (auth/onboarding, analytics,
      notifications, admin) are documented.
- [ ] 3 ADRs recorded. `pnpm typecheck`/`lint` clean.

## F. Out of scope
No product features, no backend integration changes. Do not add E2E/Playwright yet (Sprint 9).

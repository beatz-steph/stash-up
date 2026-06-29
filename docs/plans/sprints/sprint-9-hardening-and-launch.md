# Sprint 9 — Hardening, E2E, Documentation Completion, Deploy

**Goal:** prove the whole platform works end-to-end in the Nomba sandbox, close security gaps,
finish the documentation, and deploy. The "is it actually done and safe?" sprint.

**Prerequisites:** Sprints 0–8.

---

## A. End-to-end happy path (sandbox)
A scripted/manual E2E proving the full loop:
1. Two members sign up → verify email → add withdrawal account.
2. Creator makes a circle, invites the other, both join, creator activates → VAs provisioned.
3. Members fund their VAs (sandbox) → webhook reconciles → cycle hits `READY_TO_PAYOUT`.
4. Payout fires → recipient `PAID_OUT` → rotation advances → next cycle → circle `COMPLETED`.
- Capture as a documented runbook + (optionally) a Playwright E2E for the **frontend** flow
  (auth → create circle → see funding VA → see payout state) with the backend stubbed/mocked
  where real money can't be moved in CI.

## B. Security & correctness review (qa-engineer mindset)
- **Access control audit:** every circle-scoped route enforces `requireCircleMember/Creator`;
  every admin write enforces `requireSuperAdmin`; onboarding/verify gates intact.
- **Webhook safety:** raw body → dedup → timing-safe verify → `$transaction` → always 200.
- **Payout safety:** 3 layers present on every payout path including admin retry.
- **PII/secrets:** no emails/tokens/secrets in logs or analytics; `NombaConfig` ciphers never
  exposed; verify the `requireVerifiedEmail` money gate.
- **Money:** kobo everywhere; ₦ only at display; no float.
- Fix everything found; add regression tests for any bug.

## C. Documentation completion (self-documented, end to end)
- Every feature has a `docs/features/*` page; every route group is in `docs/api/`.
- `docs/runbooks/deploy.md` (Vercel: two apps, env per app, cron for sweep/payout),
  `env-reference.md` complete and current.
- `docs/README.md` is a true table of contents; `docs/architecture/*` matches the shipped
  system; ADRs cover the major decisions.
- A top-level `README.md` quickstart: run both apps, seed admin, run tests, where docs live.

## D. Deploy
- Vercel projects for `apps/web` (3000) and `apps/admin` (3001-equiv), env vars set per app
  (distinct `BETTER_AUTH_SECRET` for admin), Nomba webhook URL registered, cron jobs configured.
- Post-deploy smoke: sign-in on both apps; webhook reachable; dashboards load.

## E. Tests
- Full suite green across both apps. Add the E2E (or documented manual E2E). Regression tests
  for any issue found in B.

## F. Acceptance criteria
- [ ] Documented E2E happy path passes in sandbox.
- [ ] Security review checklist all green; findings fixed + regression-tested.
- [ ] Documentation complete: features, API, architecture, runbooks, ADRs, root README.
- [ ] Both apps deployed; post-deploy smoke passes. `pnpm typecheck`/`lint`/`test` green.

## G. Out of scope
New features. (Park anything non-essential as post-deadline backlog in `docs/`.)

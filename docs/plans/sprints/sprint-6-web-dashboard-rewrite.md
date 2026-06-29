# Sprint 6 — Web Member Dashboard Rewrite

**Goal:** **scrap the current placeholder dashboard** (`apps/web/app/page.tsx` profile/cards)
and build the real member home that ties together circles, cycles, contributions, payouts, and
notifications into one coherent, tested experience.

**Prerequisites:** Sprints 2–5 (the data + endpoints exist). **Blocks:** nothing (but it's the
demo centerpiece).

> Reuse existing: onboarding banner, notification bell, `su-` design system, the
> `lib/api/data/*` + React Query patterns. No new backend unless a read aggregate is missing.

---

## A. Remove / replace
- Delete the old dashboard body in `apps/web/app/page.tsx` (profile + withdrawal cards). Keep
  the auth/onboarding gate and the nav.
- Keep the onboarding banner for users who haven't finished setup; show the real dashboard once
  onboarding is complete.

## B. New member dashboard
- **Top:** greeting, the onboarding banner (if incomplete) OR a summary strip (active circles,
  next contribution due, next payout/turn).
- **My circles:** list of the user's circles with status, slots filled, current cycle, "your
  turn" / amount due, quick link to detail. CTA to create/join.
- **Activity:** recent notifications inline; recent contributions/payouts.
- **Circle detail page** (`/circles/[id]`): consolidate Sprint 2–5 UI — members + positions,
  current cycle pot progress + deadline, per-member contribution status, the member's own
  funding VA, payout history + turn indicator, creator controls (invite/activate while FORMING).
- Empty/loading/error states for every async section (Suspense + skeletons or query states).

## C. Read aggregates (only if needed)
- If the home needs a combined view, add `GET /api/dashboard` (session) returning the summary
  (active circles, next due, next payout) — TDD it. Otherwise compose existing endpoints.

## D. TDD / tests (frontend mandatory — this sprint is UI-heavy)
- Dashboard renders correct summary from fixtures; shows onboarding banner when incomplete.
- "My circles" list states: none / forming / active / your-turn.
- Circle detail: pot progress, contribution statuses, funding VA, payout/turn states,
  creator-only controls visible only to creator.
- Loading + error states render.
- Any new `/api/dashboard` endpoint: 401 + happy path.

## E. Documentation
- `docs/features/member-dashboard.md` — information architecture, what each section shows,
  which endpoints feed it.
- Update `docs/features/circles.md`/`payouts.md` with the final member UX.

## F. Acceptance criteria
- [ ] Old placeholder dashboard fully removed; new dashboard reflects real circle/cycle/payout
      data.
- [ ] Circle detail consolidates the full lifecycle; creator vs member controls correctly gated.
- [ ] Every async section has loading/empty/error states; all covered by frontend tests.
- [ ] Docs + typecheck/lint/tests green.

## G. Out of scope
No new money logic. Admin app untouched.

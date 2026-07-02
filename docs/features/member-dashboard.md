# Member Dashboard

The member dashboard is the StashUp web app's home (`apps/web/app/(dashboard)/page.tsx`) —
it ties together circles, cycles, contributions, payouts, and notifications into one view.
It replaced the original placeholder (profile + withdrawal cards).

## Information Architecture

The page is a server component that gates on session (`requireSession`) and fetches the
onboarding status + the user's circles server-side, then composes client sections that fetch
their own data via React Query. All reads go through the typed `lib/api/data/*` wrappers —
no Prisma in the UI layer.

| Section | Component | Data source | Shows |
|---|---|---|---|
| Header | `DashboardHeader` | — | sidebar trigger, notification bell (onboarded only), theme toggle |
| Heading | `PageHeading` | server session | greeting + "New circle" CTA (disabled until onboarded) |
| Onboarding | `OnboardingBanner` | `GET /api/onboarding/status` | setup steps; hidden once complete / when the user already has circles |
| Summary + circles | `DashboardOverview` | `GET /api/circles`, `GET /api/invites` | stat row (active / forming / pending invites / per-cycle total), pending-invites nudge, circle cards |
| Activity | `RecentActivity` | `GET /api/notifications` | latest 6 notifications (contributions, payouts, invites); onboarded only |

### Onboarding gate

Before onboarding is complete (`account && verified && withdrawal`), `DashboardOverview`
renders its content blurred and non-interactive, and `RecentActivity` renders nothing —
the onboarding banner is the focal point until setup is done. Both read the flag from
`useIsOnboarded()` (`OnboardingProvider` context).

## Circle Detail (`/circles/[id]`)

`features/circles/components/circle-detail.tsx` consolidates the Sprint 2–5 lifecycle in one
page, fed by `GET /api/circles/[id]` (+ `GET /api/circles/[id]/virtual-accounts` for the
member's own funding VA):

- **Members & positions** — roster with payout position, role, and status.
- **Current cycle** — pot progress (`potCollectedMinor / potExpectedMinor`), status, deadline.
- **Funding VA** — the caller's own virtual account details for transfers (read-isolated).
- **Payout** — recipient / "your turn" indicator, payout status (`INITIATED` / `SUCCESS` /
  `FAILED`) once `PAYOUT_INITIATED`+, failure reason, and a creator-only **Trigger Payout**
  button when the cycle is `READY_TO_PAYOUT`.
- **Creator controls** — invite / activate while the circle is `FORMING`.

Creator-only controls are gated on the caller's own membership role, not just hidden in the UI —
the backing routes enforce `requireCircleCreator`.

## States

Every async section has loading (skeletons / spinner), empty, and error states. See
`dashboard-overview.test.tsx`, `recent-activity.test.tsx`, and `circle-detail-payout.test.tsx`
for the covered scenarios.

## Read Aggregates

No dedicated `/api/dashboard` aggregate exists — the home composes the existing per-resource
endpoints. Add one only if a combined server round-trip becomes necessary.

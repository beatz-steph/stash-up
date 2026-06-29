# Sprint 2 — Circle Creation & Membership

**Goal:** members can create a savings circle, invite others by username, and accept/decline/
leave (while still `FORMING`). All on the existing schema; all endpoints TDD; all UI tested.

**Prerequisites:** Sprint 0 (TDD harness), onboarding gate (`requireOnboardingComplete`).
**Blocks:** Sprint 3.

> Models (exist): `Circle`, `CircleInvite`, `Membership`. Enums: `CircleStatus`, `Frequency`,
> `MemberRole`, `InviteStatus`, `MemberStatus`. Money: `contributionMinor` (kobo).

---

## A. Endpoints (TDD — `app/api/circles/**`, guards + DTOs + tests first)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/api/circles` | session + **`requireOnboardingComplete`** | Create circle (name, contributionMinor, frequency, totalSlots, startDeadline). Creator becomes `Membership(role=CREATOR, payoutPosition=1)`. Status `FORMING`. |
| GET | `/api/circles` | session | List circles the user is a member of (+ role, status, filled/total slots). |
| GET | `/api/circles/[id]` | session + **`requireCircleMember`** | Circle detail: members (position, status), slots, invites, status. |
| POST | `/api/circles/[id]/invites` | session + **`requireCircleCreator`** | Invite by `@username` → look up `User`, create `CircleInvite(PENDING, expiresAt)`. Reject if circle full / not FORMING / duplicate. |
| POST | `/api/circles/[id]/invites/[inviteId]/cancel` | creator | Set invite `CANCELLED`, free the slot. |
| GET | `/api/invites` | session | The user's incoming `PENDING` invites. |
| POST | `/api/invites/[id]/accept` | invited user | Create `Membership(MEMBER)` at next `payoutPosition`; invite → `ACCEPTED`. Block if circle full / not FORMING / user `blockedFromCircles`. |
| POST | `/api/invites/[id]/decline` | invited user | Invite → `DECLINED`, free slot. |
| POST | `/api/circles/[id]/leave` | member, **only while FORMING** | Membership → `LEFT`; free slot; creator cannot leave (must cancel circle). |
| POST | `/api/circles/[id]/cancel` | creator, while FORMING | Circle → `CANCELLED (CREATOR_CANCELLED)`. |

Business rules to enforce (and test): slot count never exceeds `totalSlots`; `payoutPosition`
unique per circle; no actions once status ≠ `FORMING`; `blockedFromCircles` users cannot
create/join; usernames resolved case-insensitively.

## B. Access control (`apps/web/lib/access-control.ts`)
Already has `requireCircleMember`, `requireCircleCreator`, `requireOnboardingComplete`. Add a
`requireFormingCircle(circle)` helper. Keep guards pure/server-side.

## C. Frontend (tested)
- `features/circles/` — create-circle form (RHF + zod, money entered in naira → kobo), circles
  list, circle detail (members + slots + pending invites), invite-by-username form (reuse the
  username availability pattern), incoming-invites list with accept/decline.
- Typed wrappers in `lib/api/data/circles/*` (response schemas), React Query hooks in
  `features/circles/queries|mutations/*`.

## D. TDD / tests
- **Endpoints:** for each route — 401, guard failures (403/404), invalid body (400), happy
  path, and the business rules above (full circle, duplicate invite, blocked user, not-FORMING).
  Mock `auth`/`prisma`.
- **Frontend (mandatory):** create-circle form validation + submit; invite form; invites list
  accept/decline updates UI; circle detail renders members/slots.

## E. Documentation
- `docs/features/circles.md` — lifecycle (FORMING→ACTIVE later), membership/invite rules,
  endpoints table, UI.
- Update `docs/api/` with the `/api/circles` + `/api/invites` route groups.

## F. Acceptance criteria
- [ ] All endpoints + guards behave per the rules, covered by TDD tests.
- [ ] Frontend create/invite/accept flows work and are tested.
- [ ] Slot/position invariants cannot be violated; blocked users excluded.
- [ ] Docs + typecheck/lint/tests green.

## G. Out of scope
Activation, VA provisioning, cycles (Sprint 3+). No money movement yet.

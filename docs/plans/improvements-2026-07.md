# Improvements Plan — July 2026

Implementation plan for 7 improvements. Written to be executed by an LLM agent
(Opus/Gemini) with no prior context. **Read `CLAUDE.md` first** — the API
pattern (all data through `app/api/**` route handlers, typed clients in
`lib/api/*`, React Query in features, Prisma only inside `app/api/**` and
shared backend libs), money-in-kobo, and the gate (`pnpm typecheck`,
`pnpm lint`, `pnpm --filter web test`) are non-negotiable.

Suggested execution order (each item = one commit, gate green before commit):

| # | Item | Size | Risk | Depends on |
|---|------|------|------|-----------|
| 1 | Email logo fix | XS | none | — |
| 2 | Withdrawal-save full refresh | XS | none | — |
| 3 | Nomba token proactive refresh | S | low | — |
| 4 | Paginate transactions + notifications | M | low | — |
| 5 | Realtime-ish updates (notification-driven invalidation) | M | low | 4 |
| 6 | Circle completion: close or renew | M | medium | — |
| 7 | Admin reconciliation rework (orphan spool) | L | medium | schema change |

---

## 1. Email logo fix (XS)

**Current state:** `apps/web/lib/email/templates/_layout.tsx` renders
`<Img src="https://stashup.xyz/logo.png" width=150 height=40 />`. That URL
**returns 404** — `apps/web/public/` only has `logo.svg`, `icon.svg`,
`icon-dark.svg`. Every email currently shows a broken image. Gmail/Outlook do
not render SVG, so pointing at the SVG is not a fix.

**Steps:**
1. Export `apps/web/public/logo.svg` to PNG at 2x for retina: 300×80 px
   (verify the SVG's true aspect ratio first — adjust height to match, keep
   the `Img` display size 150×40). Use `rsvg-convert`, `sharp`, or any
   available converter; commit as `apps/web/public/logo.png`. If no converter
   is available in the environment, generate with
   `npx sharp-cli -i logo.svg -o logo.png resize 300` or ask the user for the
   PNG asset.
2. Keep the absolute URL in `_layout.tsx` (email clients need absolute URLs)
   but move the origin into a constant that falls back to the deployed origin:
   `const EMAIL_ASSET_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stashup.xyz"`.
   Note the current URL uses the apex `stashup.xyz`; the site canonicalizes to
   `www.stashup.xyz` — use the www origin to avoid a redirect that some email
   proxies refuse to follow.
3. Optional polish while in the file: add `style={{ display: "block" }}` on the
   Img (Outlook gap fix).

**Acceptance:** `curl -I https://www.stashup.xyz/logo.png` → 200 after deploy;
send a test email (OTP flow) and confirm logo renders.

---

## 2. Withdrawal-account save → full refresh, no stale banner (XS)

**Current state:** The dashboard onboarding banner
(`apps/web/features/onboarding/components/onboarding-banner.tsx`) receives
`status` as a **prop from the server component** `app/(dashboard)/page.tsx`,
and `OnboardingProvider` receives `isOnboarded` the same way from the layout.
`useSaveWithdrawalAccount`
(`apps/web/features/onboarding/mutations/use-save-withdrawal-account.ts`) calls
`router.push("/")` + `router.refresh()`, but the banner still shows stale
"add withdrawal account" state after saving (server-component payload/client
cache not reliably refreshed).

**Decision (per product owner):** a full page reload is acceptable and wanted.

**Steps:**
1. In `use-save-withdrawal-account.ts` `onSuccess`: replace the
   `router.push` / `router.refresh` combo with
   `window.location.assign("/")` when no `onSuccess` callback is provided.
2. When an `onSuccess` callback IS provided (settings dialog path,
   `apps/web/features/settings/components/update-withdrawal-account-dialog.tsx`
   via `apps/web/features/settings/mutations/use-withdrawal-account.ts` — check
   whether that file has the same pattern and fix it too): call the callback
   first (closes the dialog), then `window.location.reload()`.
3. Keep the success toast BEFORE navigation is triggered; `window.location`
   navigation will drop it, so either accept that (banner disappearing is
   itself the feedback) or pass `?saved=1` and toast on mount. Simplest:
   accept the drop, remove the toast on this path.

**Acceptance:** From a fresh account, save a withdrawal account from the
banner-triggered modal → page reloads, banner gone. Change it from Settings →
dialog closes, page reloads, no stale data anywhere.

---

## 3. Nomba token issue/refresh slowness (S)

**Current state:** `apps/web/lib/nomba-client.ts` `getToken()`:
- Token cached in Redis (`nomba:token`) with 26-min TTL, treated valid for 25.
- On expiry, the **caller blocks** on `/v1/auth/token/issue` or
  `/token/refresh` (~1–3 s) before the actual API call runs — this is the
  observed slowness (activation, payouts, VA creation all pay it).
- In-flight dedup uses a module-level `tokenPromise`, which does not dedupe
  across serverless instances → thundering herd on cold expiry.

**Steps (all in `nomba-client.ts`):**
1. **Serve-stale-while-refresh:** add `refresh_after` (= issue time + 20 min)
   to the stored `NombaToken`. In `getToken()`: if `now < expires_at` return
   the token immediately; additionally, if `now > refresh_after`, fire
   `doRefreshToken(token)` **without awaiting** (`void ...catch(console.error)`)
   so the refresh happens in the background while the request proceeds on the
   still-valid token. Only block when the token is actually expired/absent.
2. **Cross-instance lock:** before a blocking `fetchNewToken`/background
   refresh, `SET nomba:token:lock <id> NX EX 15`. If not acquired: for the
   background path, skip (someone else is refreshing); for the blocking path,
   poll `redis.get(TOKEN_KEY)` every 250 ms up to 5 s for the fresh token, then
   fall through to fetching anyway. Release lock in `finally` (compare-and-del
   via Lua or just DEL — 15 s TTL bounds the damage).
3. **Timeout:** wrap the token fetches in `AbortSignal.timeout(8000)` so a slow
   Nomba auth endpoint can't hang a payout webhook handler.
4. Keep the existing module-level `tokenPromise` dedup — it still helps within
   one instance.

**Tests:** unit-test `getToken` decision logic by extracting a pure
`decideTokenAction(token, now)` → `"use" | "use+refresh" | "block"` and testing
the three branches (mirrors existing test style in `lib/**/*.test.ts`).

**Acceptance:** steady-state Nomba calls never block on auth (only the first
call after >25 min idle does); no duplicate issue calls under concurrency
(verify via logs in dev).

---

## 4. Paginate transactions and notifications (M)

**Current state:**
- `GET /api/transactions` (`apps/web/app/api/transactions/route.ts`) merges
  inbound transfers + payouts, `?limit=` capped at 100, **no cursor** — older
  history is unreachable.
- `GET /api/notifications` (`apps/web/app/api/notifications/route.ts`) hard
  `take: 30`, no pagination.
- UIs: `features/transactions/components/all-transactions.tsx` (full page),
  `recent-transactions.tsx` (dashboard, limit 6 — leave as-is),
  `features/notifications/components/notification-bell.tsx`.

**Design — cursor pagination** (offset breaks with a merged two-source feed):
cursor = `createdAt` ISO string + id tiebreaker, encoded
`base64(createdAt|id)`.

**Steps — transactions:**
1. DTO (`app/api/transactions/dto/transaction.dto.ts`): add
   `nextCursor: z.string().nullable()` to `TransactionListResSchema`.
2. Route: accept `?cursor=`. Decode → `{ createdAt, id }`. Add to BOTH queries
   a filter equivalent to `(createdAt < cursor.createdAt) OR
   (createdAt = cursor.createdAt AND id < cursor.id)` (fields: `receivedAt`
   for inbound, `createdAt` for payouts; keep `orderBy` desc adding `id` as a
   secondary sort key). Fetch `limit + 1` from each source, merge, sort desc,
   slice to `limit`; if more remained, `nextCursor` = cursor of the last
   returned item, else `null`.
3. `lib/api/data/transactions/index.ts`: `fetchTransactions(limit?, cursor?)`.
4. `features/transactions/queries/use-transactions.ts`: add
   `useInfiniteTransactions()` using `useInfiniteQuery`
   (`getNextPageParam: (last) => last.nextCursor ?? undefined`). Keep the
   existing `useTransactions(limit)` for the dashboard widget.
5. `all-transactions.tsx`: flatten pages; add a "Load more" button
   (`fetchNextPage`, hidden when `!hasNextPage`, spinner while
   `isFetchingNextPage`). Match existing su-* token styling.
6. Update `app/api/transactions/route.test.ts`: cursor round-trip test — page 1
   returns `nextCursor`, page 2 excludes page-1 items; assert per-user scoping
   still holds.

**Steps — notifications:**
1. Same cursor pattern on `GET /api/notifications` (`?cursor=`, `?limit=`
   default 30, max 50). `unreadCount` must remain a separate un-paginated
   count (only computed on the first page request is fine).
2. `use-notifications.ts` → convert to `useInfiniteQuery` **but keep the hook
   export shape compatible** with `notification-bell.tsx` (flatten pages
   internally, expose `items`, `unreadCount`, `fetchNextPage`, `hasNextPage`).
   Note the 30 s `refetchInterval`: with infinite queries, refetch refetches
   ALL loaded pages — cap by only auto-refetching when just one page is loaded
   (`refetchInterval: (q) => q.state.data?.pages.length === 1 ? 30_000 : false`)
   to avoid hammering; item 5 replaces the freshness story anyway.
3. Add "Load more" at the bottom of the bell dropdown list.
4. Check the mark-all-read mutation (grep `readAt` mutations under
   `features/notifications/`) still invalidates the right key.

**Acceptance:** seed >60 transactions / >40 notifications; both UIs page
through completely; no duplicate/skipped rows across page boundaries
(equal-timestamp rows covered by the id tiebreaker).

---

## 5. Realtime updates (M) — pragmatic approach

**Current state:** the ONLY polling is notifications every 30 s. Circle
detail, dashboard, transactions go stale until manual refresh — e.g. a
contribution webhook lands, pot progress doesn't move.

**Decision:** do NOT introduce websockets/SSE on Vercel serverless (function
lifetime limits make SSE fragile; a hosted provider like Pusher/Ably is a new
dependency + billing). Use the **notification stream as a change feed**: every
domain event that matters already creates a `Notification` row
(`lib/notifications.ts` — verify: payment received, payout sent, cycle
advanced; if contribution-received notifications are missing for non-recipient
members, that's out of scope here).

**Steps:**
1. Create `features/realtime/use-realtime-invalidation.ts`: a hook that
   observes the notifications query result. Keep a ref of the newest
   notification id; when a NEW id appears, map `notification.type` →
   query invalidations:
   - `PAYMENT_*` / contribution types → invalidate `["circle-detail"]`-family
     keys (grep `features/circles/queries` for exact keys), `["transactions"]`,
     dashboard overview key.
   - `PAYOUT_*` → same set.
   - default → invalidate nothing.
   Use `queryClient.invalidateQueries({ queryKey })` — cheap, targeted.
2. Mount the hook once in the dashboard layout provider tree
   (`app/(dashboard)/` — find the client provider component that wraps pages,
   e.g. where `OnboardingProvider` is mounted).
3. Tighten notification polling to 15 s **when the tab is visible**:
   `refetchInterval: () => document.visibilityState === "visible" ? 15_000 : false`
   (guard `typeof document`), keep `refetchOnWindowFocus: true`.
4. Also add `refetchOnWindowFocus: true` + `staleTime: 10_000` to circle
   detail and transactions queries so tab-switch back always freshens.

**Acceptance:** two browsers, same circle: browser A funds (simulate webhook
via existing dev tooling/tests), browser B sees pot progress + new transaction
within ~15 s without a manual reload.

**Future upgrade path (document only, don't build):** swap the poll for SSE
via a dedicated always-on runtime or Pusher; the invalidation map from step 1
is reused as-is.

---

## 6. Circle completion — close or renew (M)

**Current state:** after the final payout, `advanceRotation`
(`apps/web/lib/payout/rotation.ts`) sets circle `status: "COMPLETED"`. Grep
shows **zero** UI handling of `COMPLETED` in `apps/web` — the circle just
looks frozen. Enum: `CircleStatus { FORMING, ACTIVE, COMPLETED, CANCELLED }`.

**Product intent:** when every member has been paid once (rotation complete),
the creator chooses: **close** the circle (archive; default) or **renew** it —
run another full rotation with the same members, amounts, and VAs.

**Design — renew = reset in place** (NOT a cloned circle: VAs are keyed to
membershipId via `accountRef = membership_<id>`, so reusing memberships means
zero re-provisioning; cloning would orphan the funding accounts members
already saved):
- New endpoint `POST /api/circles/[id]/renew` (creator-only,
  `requireCircleCreator` from `lib/access-control.ts`):
  - Guards: circle `status === "COMPLETED"`; all memberships still ACTIVE
    (if any member left/suspended, reject with a clear message for v1).
  - In one `$transaction` (typed `tx: Prisma.TransactionClient` — build
    requirement): compute `renewalRound = currentCycleSeq / totalSlots` (or
    add an explicit `Circle.renewalCount Int @default(0)` — **preferred**,
    increment it); create the next cycle with
    `sequence: currentCycleSeq + 1`, recipient = `payoutPosition 1` member,
    `potExpectedMinor` recomputed from ACTIVE members, deadline via
    `calculateDeadline(circle.frequency)`; set circle `status: "ACTIVE"`,
    `currentCycleSeq: sequence`. **Buffer auto-apply:** reuse the same logic
    as `advanceRotation` — extract the buffer-application block in
    `rotation.ts` into a shared `applyBuffersToNewCycle(tx, circle, newCycle)`
    and call it from both places (do not duplicate).
- **Rotation mapping change** in `rotation.ts`: recipient lookup currently is
  `payoutPosition === nextSequence` and completion check is
  `sequence >= totalSlots`. With renewals, sequence keeps growing. Change to:
  `posInRound = ((sequence - 1) % totalSlots) + 1`; recipient =
  `payoutPosition === posInRound + 1`-style arithmetic (careful: compute
  `nextPos = (sequence % totalSlots) + 1`), and completion check becomes
  `sequence % totalSlots === 0` (end of a round) → set COMPLETED. Update
  `rotation.test.ts` accordingly and add a renewal-round case
  (e.g. totalSlots 3, sequence 4 → recipient position 2).
- Schema: `Circle.renewalCount Int @default(0)` — migration via
  `npx prisma migrate dev --name circle_renewal_count` from `packages/db/`.

**UI (`features/circles/components/circle-detail.tsx`):**
- When `status === "COMPLETED"`: show a "Rotation complete 🎉" card in the
  right column (replaces "Manage circle"): every member has received a payout;
  creator sees two actions — **Renew circle** (calls new mutation, confirm
  dialog: "Start another full rotation with the same members and amounts?")
  and a passive "Leave closed" state (no action needed — closed is the
  default). Non-creators see a read-only completion note.
- Header badge: add a distinct style for COMPLETED (neutral/positive, not the
  yellow FORMING style).
- Hide the "Fund your circle" card when not ACTIVE.
- Add mutation `useRenewCircle(circleId)` in `features/circles/mutations`
  (invalidate circle detail on success) + typed wrapper in
  `lib/api/data/circles`.
- Cycle history (already built) provides the per-round record; no change.

**Tests:** route test for renew (403 non-creator, 400 not-completed, happy
path creates cycle seq N+1 with correct recipient + buffer application);
rotation tests for the modulo mapping.

**Acceptance:** complete a 2-member circle end-to-end in dev; circle shows
completion card; renew → new OPEN cycle, correct recipient, VA details
unchanged, funding works again.

---

## 7. Admin reconciliation rework — orphan spool (L)

**Current state:** `apps/admin/app/api/reconciliation/route.ts` lists
`InboundTransfer` where `matchStatus ∉ (MATCHED, MANUAL)` — i.e. UNMATCHED,
**UNDERPAID, OVERPAID**. But under/over-payments are now handled
automatically (partial amounts apply to the pot; surplus goes to
`Membership.bufferMinor` and auto-applies next cycle via `rotation.ts`).
Showing them as recon work items is wrong. The real gap: transactions that hit
the Nomba **sub-account** but never produced a webhook (missed/failed
delivery) or hit an unknown VA — true **orphans**.

**Design:**
1. **Narrow the queue:** admin recon lists only genuine attention items:
   `InboundTransfer.matchStatus === "UNMATCHED"` (webhook arrived, couldn't
   attribute) + spooled orphans (below). UNDERPAID/OVERPAID disappear from the
   queue (they're informational; visible in transfer history if needed).
2. **Orphan spool:** an interval job pulls the sub-account transaction history
   from Nomba and diffs against what we recorded.
   - **Nomba API:** transaction listing for the sub-account. Likely
     `GET /v1/transactions/accounts` with the `accountId` header set to
     `NOMBA_SUB_ACCOUNT_ID` (or a
     `/v1/transactions/accounts/{subAccountId}`-style path) with
     `dateFrom/dateTo` + pagination params. **VERIFY against Nomba docs
     (docs.nomba.com) before implementing — do not guess; the existing
     `nombaFetch` helper in `apps/web/lib/nomba-client.ts` shows the
     auth/header pattern.** Add `listSubAccountTransactions({ from, to,
     cursor })` to `nomba-client.ts` with a zod schema for the response.
   - **Schema** (in `packages/db/prisma/business.prisma`; migration
     `orphan_transactions`):
     ```prisma
     model OrphanTransaction {
       id                 String   @id @default(cuid())
       provider           String   @default("NOMBA")
       nombaTransactionId String   @unique
       amountMinor        Int
       currency           String   @default("NGN")
       type               String            // credit/debit as reported
       narration          String?
       senderName         String?
       accountRef         String?           // VA ref if Nomba reports one
       transactionAt      DateTime
       spooledAt          DateTime @default(now())
       status             OrphanStatus @default(PENDING)
       resolvedById       String?           // admin_user id
       resolvedAt         DateTime?
       resolutionNote     String?
       inboundTransferId  String?  @unique  // set when replayed into the normal flow
       @@index([status, transactionAt])
     }
     enum OrphanStatus { PENDING RESOLVED IGNORED }
     ```
   - **Spool job:** `apps/web/app/api/cron/orphan-spool/route.ts` (web app owns
     Nomba integration; admin reads the shared DB). Guard with the existing
     `CRON_SECRET` header pattern (copy from
     `apps/web/app/api/cron/cycle-sweep/route.ts`). Logic: window = last 48 h
     (overlap is fine — dedup on `nombaTransactionId`); page through Nomba
     transactions; for each **credit**: skip if
     `InboundTransfer.nombaTransactionId` exists OR an `OrphanTransaction`
     exists; else insert `OrphanTransaction`. Ignore debits (payouts are
     tracked via `Payout`; reconciling those is out of scope).
   - **Scheduling:** `vercel.json` currently has NO crons (they were removed —
     commit `d7708ba` — most likely because Vercel Hobby allows only daily
     crons / limited count). Re-add:
     ```json
     { "crons": [
       { "path": "/api/cron/orphan-spool", "schedule": "0 */6 * * *" },
       { "path": "/api/cron/cycle-sweep",  "schedule": "0 6 * * *" }
     ] }
     ```
     **Confirm with the owner which Vercel plan is active** — on Hobby, use
     one daily cron each (`0 6 * * *` / `30 6 * * *`) or an external pinger
     (GitHub Actions schedule hitting the URL with the secret header).
     Flag this as a decision point; don't silently pick.
3. **Admin API changes** (`apps/admin/app/api/reconciliation/`):
   - `GET route.ts`: change `whereClause` to `matchStatus: "UNMATCHED"` only;
     add a parallel `GET /api/reconciliation/orphans` route (same pagination
     DTO pattern) listing `OrphanTransaction` where `status: "PENDING"`.
   - Resolve endpoints (super-admin, mirror the existing
     `[id]/resolve/route.ts` + `recordAudit` pattern):
     `POST /api/reconciliation/orphans/[id]/ignore` (status → IGNORED, note
     required) and `POST /api/reconciliation/orphans/[id]/resolve` — v1 scope:
     mark RESOLVED with a required `resolutionNote` (money movement/manual
     credit is handled outside the app). Do NOT build automatic replay into
     the contribution flow in v1; note it as follow-up.
4. **Admin UI** (`apps/admin/app/(dashboard)/reconciliation/page.tsx`): two
   tabs — "Unmatched webhooks" (existing table, narrowed) and "Orphans
   (spooled)" (new table: Nomba tx id, amount, narration, sender, transaction
   time, spooled time, actions Resolve/Ignore with note dialog). Follow the
   existing admin table/component patterns; update
   `apps/admin/lib/api/data/reconciliation.ts` typed wrappers.
5. **Tests:** spool route (dedup against existing InboundTransfer + existing
   orphan; credit-only; CRON_SECRET 401), narrowed queue filter, orphan
   resolve/ignore audit records. Mock the Nomba listing client (msw or vi.mock,
   matching existing test style in `apps/admin/app/api/reconciliation/*.test.ts`).

**Acceptance:** with a seeded Nomba response containing 1 known + 1 unknown
credit, spool inserts exactly the unknown one; recon queue shows only
UNMATCHED + PENDING orphans; resolve/ignore work with audit rows; UNDERPAID/
OVERPAID transfers no longer appear.

---

## Cross-cutting requirements (every item)

- `tx` params in any new `$transaction` MUST be typed
  `(tx: Prisma.TransactionClient)` — the Vercel build fails on inference.
- Any new Prisma model/field: migrate from `packages/db/` with
  `npx prisma migrate dev --name <desc>`; never edit generated output. The
  root `postinstall`/`build` already run `prisma generate`.
- New env vars → add to `turbo.json` `globalEnv` and document in `CLAUDE.md`.
- Money is kobo `Int` everywhere; UI formats via `formatNaira`.
- Gate before each commit: `pnpm typecheck && pnpm lint &&
  pnpm --filter web test` (plus `--filter admin test` for item 7).
- Never log PII, tokens, or webhook secrets.

## Open questions for the product owner (ask before items 6–7)

1. **Renew semantics:** same payout order every round, or allow the creator to
   reshuffle before renewing? (Plan assumes same order; reshuffle is a v2.)
2. **Vercel plan:** Hobby or Pro? Determines cron cadence for the orphan spool
   (6-hourly vs daily vs external pinger).
3. **Orphan resolution v1:** is "mark resolved with a note" enough, or must an
   orphan be replayable into a member's contribution (money-moving, higher
   risk)?

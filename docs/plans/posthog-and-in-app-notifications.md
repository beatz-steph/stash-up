# Execution Plan — PostHog Analytics + In‑App Notifications

> Handoff spec for an implementing agent (Gemini). Self‑contained: assume no prior
> conversation context. Implement **Part A** and **Part B** in order. Do **not** add
> Novu or any third‑party notification service — in‑app notifications are homegrown.

---

## 0. Context the implementer MUST follow

**App:** `apps/web` — a Next.js 16 (App Router, Turbopack) app in a pnpm monorepo.
Stack: Prisma 7 (`@workspace/db`), BetterAuth, React Query, shadcn/ui (`@workspace/ui`),
Tailwind v4 with a `su-` design token system, Resend for email.

**Architecture rule (non‑negotiable — already established in the codebase):**
`app/api/**` is treated as a standalone backend service that will later be extracted.
**Every data read/write goes through an API route handler.** The only exception is
BetterAuth (`auth.api.*` / `authClient.*`).

- `prisma` is imported **only** inside `app/api/**` and backend libs that routes import
  (e.g. `lib/access-control.ts`, `lib/auth.ts`). **Never** in components, `features/*`,
  or `lib/api/data/*`.
- Components (server *and* client) fetch through the typed client in `lib/api/data/*`.
- Server Components call wrappers with `await serverApiOptions()` (forwards cookie + origin).
- Client Components call the same wrappers via React Query hooks under
  `features/<feature>/queries/*` and `features/<feature>/mutations/*`.

**Existing conventions to match exactly:**

- **Typed HTTP client** `apps/web/lib/api/client.ts` exposes:
  ```ts
  api.get<T>(path, schema?, options?)   // schema = Zod schema; response is schema.parse(data)
  api.post<T>(path, body?, schema?, options?)
  // ApiOptions = { baseUrl?, headers?, signal? }
  ```
  Always pass a Zod **response** schema so responses are validated at the boundary.
- **Request validation** `apps/web/lib/api/validate.ts`:
  ```ts
  const validation = await validateRequestBody(request, SomeReqSchema)
  if (!validation.success) return validation.errorResponse
  const data = validation.data
  ```
- **Session guard** in every protected route:
  ```ts
  import { auth } from "@/lib/auth"
  import { headers } from "next/headers"
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  ```
- **DTOs** live beside their route in `app/api/<area>/dto/*.dto.ts` as Zod schemas +
  inferred types. **DTOs must be client‑safe** → they import only `zod`, never `@workspace/db`.
- **Toasts:** `import { toast } from "@workspace/ui/components/sonner"` (never from `sonner`).
- **Money:** integers in **kobo** (`amountMinor`). Never floats. Don't put raw amounts in analytics.
- **No `as any`.** Fix types properly.

**Absolute PII rule (#8):** never log or transmit PII, tokens, emails, phone numbers, or
session tokens. This governs **all** PostHog calls — identify by user id only; never send
email/name/phone as person or event properties.

**Verification after every change:**
```bash
pnpm --filter web typecheck
pnpm --filter web lint
```
Both must pass (0 errors). Prisma changes run from `packages/db/`:
```bash
cd packages/db && npx prisma migrate dev --name <desc> && npx prisma generate
```
(Run `prisma generate` explicitly — the pnpm store client does not refresh automatically.)

---

# PART A — PostHog (minimal, funnel‑focused)

**Goal:** measure the activation funnel `signup → email verified → withdrawal added →
circle created/joined`, plus autocaptured pageviews. Keep scope tight: autocapture +
5 explicit events + identify/reset. No session replay, no feature flags, no experiments.

### A1. Install
```bash
pnpm --filter web add posthog-js posthog-node
```

### A2. Env vars
Add to `apps/web/.env` and `apps/web/.env.example`:
```
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```
> Use these exact names consistently across all files below. (`NEXT_PUBLIC_` is required so
> the key is available client‑side.) Region host: use `https://eu.i.posthog.com` if the
> project is EU‑hosted.

### A3. Client init — `apps/web/instrumentation-client.ts` (NEW, at app root, next to `app/`)
Next.js 15.3+/16 auto‑loads this file on the client. The `defaults: '2026-05-30'` flag
enables modern defaults including **automatic pageview + pageleave capture for SPA route
changes** and autocapture — so **no** `PostHogProvider`/`PostHogPageView` boilerplate is needed.
```ts
import posthog from "posthog-js"

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (key) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-05-30",
  })
}
```
> Guarding on `key` lets the app run locally without a PostHog project (no crash).

### A4. Typed event registry — `apps/web/lib/analytics/events.ts` (NEW)
```ts
/** Canonical analytics event names. Add new events here so call sites stay typed. */
export const AnalyticsEvent = {
  SignupCompleted: "signup_completed",
  EmailVerified: "email_verified",
  WithdrawalAdded: "withdrawal_added",
  CircleCreated: "circle_created",
  CircleJoined: "circle_joined",
} as const

export type AnalyticsEvent = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent]

/** Allowed, non‑PII event properties. Never add email/name/phone/raw amounts. */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>
```

### A5. Client capture wrapper — `apps/web/lib/analytics/client.ts` (NEW)
Imported only by client components. Thin wrapper over the posthog‑js singleton.
```ts
import posthog from "posthog-js"
import type { AnalyticsEvent, AnalyticsProps } from "./events"

export function track(event: AnalyticsEvent, properties?: AnalyticsProps) {
  if (typeof window === "undefined") return
  posthog.capture(event, properties)
}

export function identifyUser(userId: string) {
  if (typeof window === "undefined") return
  posthog.identify(userId)
}

export function resetUser() {
  if (typeof window === "undefined") return
  posthog.reset()
}
```

### A6. Server capture wrapper — `apps/web/lib/analytics/server.ts` (NEW)
For reliable money/lifecycle events fired inside API routes / auth hooks. Uses a module
singleton and **awaits `flush()`** so events aren't lost when a serverless function freezes.
```ts
import { PostHog } from "posthog-node"
import type { AnalyticsEvent, AnalyticsProps } from "./events"

let client: PostHog | null = null

function getServerClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return null
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return client
}

/** Fire-and-flush a server-side event. Never throws into the caller. */
export async function captureServer(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: AnalyticsProps,
) {
  const ph = getServerClient()
  if (!ph) return
  try {
    ph.capture({ distinctId, event, properties })
    await ph.flush()
  } catch {
    // analytics must never break the request
  }
}
```

### A7. Identify on session + reset on logout
**Identify (client):** `apps/web/components/posthog-identify.tsx` (NEW)
```tsx
"use client"

import { useEffect } from "react"
import { identifyUser } from "@/lib/analytics/client"

export function PostHogIdentify({ userId }: { userId: string }) {
  useEffect(() => {
    identifyUser(userId)
  }, [userId])
  return null
}
```
Render it from the authenticated dashboard so every visit links events to the user.
In `apps/web/app/page.tsx`, after the session check, add inside the returned JSX (e.g.
just under the opening wrapper `<div>`):
```tsx
import { PostHogIdentify } from "@/components/posthog-identify"
// ...
<PostHogIdentify userId={user.id} />
```
> If/when an authenticated layout is introduced, move this there so it covers all pages.

**Reset (client):** in `apps/web/components/sign-out-button.tsx`, import the helper and call
it in the existing `onSuccess` callback (alongside the router push):
```ts
import { resetUser } from "@/lib/analytics/client"
// inside authClient.signOut fetchOptions.onSuccess:
resetUser()
router.push("/sign-in")
router.refresh()
```

### A8. Wire the 5 funnel events

1. **`signup_completed` + identify (client)** — `apps/web/features/auth/forms/sign-up/model.tsx`,
   inside `submitStep2`, in the success branch after `authClient.signUp.email`:
   ```ts
   import { track, identifyUser } from "@/lib/analytics/client"
   import { AnalyticsEvent } from "@/lib/analytics/events"
   // ...
   const { data, error } = await authClient.signUp.email({ /* existing args */ })
   if (error) { /* existing handling */ return }
   if (data?.user?.id) identifyUser(data.user.id)
   track(AnalyticsEvent.SignupCompleted)
   // existing toast + redirect
   ```

2. **`email_verified` (server)** — `apps/web/lib/auth.ts`, inside
   `emailVerification.afterEmailVerification` (this hook already exists and sends the welcome
   email). Add:
   ```ts
   import { captureServer } from "@/lib/analytics/server"
   import { AnalyticsEvent } from "@/lib/analytics/events"
   // inside afterEmailVerification(user):
   await captureServer(user.id, AnalyticsEvent.EmailVerified)
   ```
   (Also emit the welcome **notification** here — see Part B, step B8.)

3. **`withdrawal_added` (server)** — `apps/web/app/api/withdrawal-account/route.ts`, in `POST`
   after the successful `prisma.withdrawalAccount.upsert`, before `return`:
   ```ts
   import { captureServer } from "@/lib/analytics/server"
   import { AnalyticsEvent } from "@/lib/analytics/events"
   // after upsert succeeds:
   await captureServer(session.user.id, AnalyticsEvent.WithdrawalAdded)
   ```

4. **`circle_created` / `circle_joined` (server) — STUBS for when circles are built.**
   These routes don't exist yet. When the circle create/join API routes are added, call:
   ```ts
   await captureServer(session.user.id, AnalyticsEvent.CircleCreated, { circleId })
   await captureServer(session.user.id, AnalyticsEvent.CircleJoined, { circleId })
   ```
   `circleId` is a non‑PII identifier and is allowed. Do **not** add amounts. Leave a
   `// TODO(analytics): circle_created/joined` note where the routes will live.

### A9. (Optional) Reverse proxy to dodge ad‑blockers
Only if time permits. In `apps/web/next.config.ts`:
```ts
const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ]
  },
  skipTrailingSlashRedirect: true,
}
```
Then set `api_host: "/ingest"` and add `ui_host: "https://us.posthog.com"` in
`instrumentation-client.ts`. (EU: swap hosts accordingly.) Skip this if unsure — it's not
required for the funnel to work.

### A10. PostHog acceptance checklist
- [ ] `pnpm --filter web typecheck && pnpm --filter web lint` pass.
- [ ] App runs with **no** PostHog env set (guards prevent crashes).
- [ ] With env set: PostHog Live Events shows autocaptured `$pageview` on navigation.
- [ ] Completing signup → verify → withdrawal produces `signup_completed`,
      `email_verified`, `withdrawal_added`, all attributed to the same person (one
      `identify`).
- [ ] No event/person property contains email, name, phone, token, or raw amount.

---

# PART B — In‑App Notifications (homegrown)

**Goal:** a notification bell in the dashboard nav with an unread badge and a dropdown
feed, backed by a `Notification` table, exposed through API routes, polled via React Query.
A single backend helper (`createNotification`) is the emit point all features call.

### B1. Schema — `packages/db/prisma/business.prisma` (EDIT) + `auth.prisma` (EDIT)

Add to `business.prisma` (enum near the other enums, model near the other models):
```prisma
enum NotificationType {
  WELCOME
  EMAIL_VERIFIED
  CIRCLE_INVITE
  CIRCLE_JOINED
  CIRCLE_ACTIVATED
  CONTRIBUTION_DUE
  CONTRIBUTION_RECEIVED
  PAYOUT_SENT
  PAYOUT_RECEIVED
  DEFAULT_WARNING
  GENERIC
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType @default(GENERIC)
  title     String
  body      String
  link      String?          // optional in-app deep link, e.g. "/circles/abc123"
  metadata  Json?            // optional structured context (circleId, cycleId, …) — no PII
  readAt    DateTime?
  createdAt DateTime         @default(now())

  @@index([userId, readAt])
  @@index([userId, createdAt])
  @@map("notification")
}
```

`User` is defined in `auth.prisma`. Add the back‑relation field to the `User` model:
```prisma
  notifications Notification[]
```

Then:
```bash
cd packages/db && npx prisma migrate dev --name add_notifications && npx prisma generate
```

### B2. Backend emit/query helper — `apps/web/lib/notifications.ts` (NEW, server‑only)
Single source of truth for creating/reading notifications. Imports prisma → only ever
imported by `app/api/**` and server hooks (`lib/auth.ts`). The `NotificationType` enum
type comes from `@workspace/db` (which re‑exports `@prisma/client`).
```ts
import { prisma } from "@workspace/db"
import type { NotificationType, Prisma } from "@workspace/db"

interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  link?: string
  metadata?: Prisma.InputJsonValue
}

/** Emit an in-app notification. Never throws into the caller. */
export async function createNotification(input: CreateNotificationInput) {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        metadata: input.metadata,
      },
    })
  } catch (error) {
    console.error("Failed to create notification:", error)
  }
}
```

### B3. DTOs — `apps/web/app/api/notifications/dto/notification.dto.ts` (NEW, client‑safe)
> JSON serializes `DateTime` → ISO string, so `createdAt`/`readAt` are strings in the DTO.
> The enum is duplicated as a `z.enum` because DTOs must not import `@workspace/db`.
```ts
import { z } from "zod"

export const NotificationTypeSchema = z.enum([
  "WELCOME",
  "EMAIL_VERIFIED",
  "CIRCLE_INVITE",
  "CIRCLE_JOINED",
  "CIRCLE_ACTIVATED",
  "CONTRIBUTION_DUE",
  "CONTRIBUTION_RECEIVED",
  "PAYOUT_SENT",
  "PAYOUT_RECEIVED",
  "DEFAULT_WARNING",
  "GENERIC",
])
export type NotificationTypeDto = z.infer<typeof NotificationTypeSchema>

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  metadata: z.unknown().nullable().optional(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
})
export type Notification = z.infer<typeof NotificationSchema>

export const NotificationListResSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: z.number(),
})
export type NotificationListRes = z.infer<typeof NotificationListResSchema>

export const MarkReadReqSchema = z.object({
  // omit `ids` → mark ALL of the user's notifications read
  ids: z.array(z.string()).optional(),
})
export type MarkReadReq = z.infer<typeof MarkReadReqSchema>

export const MarkReadResSchema = z.object({ unreadCount: z.number() })
export type MarkReadRes = z.infer<typeof MarkReadResSchema>
```

### B4. API routes

**`apps/web/app/api/notifications/route.ts`** (NEW) — list + unread count:
```ts
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@workspace/db"
import { auth } from "@/lib/auth"

const NOTIFICATION_LIMIT = 30

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_LIMIT,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        metadata: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ])

  const items = rows.map((n) => ({
    ...n,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }))

  return NextResponse.json({ items, unreadCount })
}
```

**`apps/web/app/api/notifications/mark-read/route.ts`** (NEW) — mark some/all read:
```ts
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@workspace/db"
import { auth } from "@/lib/auth"
import { validateRequestBody } from "@/lib/api/validate"
import { MarkReadReqSchema } from "../dto/notification.dto"

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const validation = await validateRequestBody(request, MarkReadReqSchema)
  if (!validation.success) return validation.errorResponse

  const userId = session.user.id
  const { ids } = validation.data

  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  })

  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } })
  return NextResponse.json({ unreadCount })
}
```
> Note `userId` is always in the `where` clause — a user can only read/mark their own
> notifications (access control by ownership).

### B5. Typed data wrappers — `apps/web/lib/api/data/notifications/index.ts` (NEW)
```ts
import { api, type ApiOptions } from "../../client"
import {
  NotificationListResSchema,
  MarkReadResSchema,
  type MarkReadReq,
} from "@/app/api/notifications/dto/notification.dto"

export function fetchNotifications(options?: ApiOptions) {
  return api.get("/api/notifications", NotificationListResSchema, options)
}

export function markNotificationsRead(body: MarkReadReq, options?: ApiOptions) {
  return api.post("/api/notifications/mark-read", body, MarkReadResSchema, options)
}
```

### B6. React Query hooks

**`apps/web/features/notifications/queries/use-notifications.ts`** (NEW) — polls for near‑real‑time:
```ts
import { useQuery } from "@tanstack/react-query"
import { fetchNotifications } from "@/lib/api/data/notifications"

export const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => fetchNotifications(),
    refetchInterval: 30_000, // 30s polling — adequate for the hackathon (no websockets)
    refetchOnWindowFocus: true,
  })
}
```

**`apps/web/features/notifications/mutations/use-mark-notifications-read.ts`** (NEW):
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { markNotificationsRead } from "@/lib/api/data/notifications"
import type { MarkReadReq } from "@/app/api/notifications/dto/notification.dto"
import { NOTIFICATIONS_QUERY_KEY } from "../queries/use-notifications"

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: MarkReadReq) => markNotificationsRead(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
    },
  })
}
```

### B7. UI — notification bell

**`apps/web/features/notifications/components/notification-bell.tsx`** (NEW). Uses
`Popover`, `ScrollArea`, `Badge` (all exist in `@workspace/ui`). Styled with `su-` tokens.
```tsx
"use client"

import { useRouter } from "next/navigation"
import { Bell } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { useNotifications } from "../queries/use-notifications"
import { useMarkNotificationsRead } from "../mutations/use-mark-notifications-read"
import type { Notification } from "@/app/api/notifications/dto/notification.dto"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function NotificationBell() {
  const router = useRouter()
  const { data } = useNotifications()
  const markRead = useMarkNotificationsRead()

  const items = data?.items ?? []
  const unreadCount = data?.unreadCount ?? 0

  const handleItemClick = (n: Notification) => {
    if (!n.readAt) markRead.mutate({ ids: [n.id] })
    if (n.link) router.push(n.link)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-10 w-10 rounded-su-full bg-su-canvas border-su-hairline text-su-ink hover:bg-su-surface-soft"
          aria-label="Notifications"
        >
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-su-full bg-su-primary px-1 text-su-on-primary text-su-caption-sm">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 bg-su-surface-card border-su-hairline rounded-su-lg shadow-lg"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-su-hairline-soft">
          <span className="font-su-sans text-su-title-sm font-semibold text-su-ink">
            Notifications
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate({})}
              disabled={markRead.isPending}
              className="font-su-sans text-su-caption font-semibold text-su-primary hover:text-su-primary-active"
            >
              Mark all read
            </button>
          )}
        </div>

        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center font-su-sans text-su-body-sm text-su-muted">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="divide-y divide-su-hairline-soft">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-su-surface-soft ${
                      n.readAt ? "" : "bg-su-surface-soft/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-su-full bg-su-primary" />
                      )}
                      <div className="space-y-0.5">
                        <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                          {n.title}
                        </p>
                        <p className="font-su-sans text-su-caption text-su-muted leading-snug">
                          {n.body}
                        </p>
                        <p className="font-su-sans text-su-caption-sm text-su-muted-soft">
                          {timeAgo(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
```

**Place the bell in the dashboard nav.** In `apps/web/app/page.tsx`, the `<nav>` currently
renders `@{user.username}` and `<SignOutButton />`. Add the bell to that right‑hand group:
```tsx
import { NotificationBell } from "@/features/notifications/components/notification-bell"
// inside the nav's right-side flex container, before SignOutButton:
<NotificationBell />
```

### B8. Wire the first emit points (so the feed has real content to demo)

1. **Welcome notification on verification** — `apps/web/lib/auth.ts`, in
   `emailVerification.afterEmailVerification(user)` (same hook as the welcome email + the
   `email_verified` analytics event):
   ```ts
   import { createNotification } from "@/lib/notifications"
   // inside afterEmailVerification(user):
   await createNotification({
     userId: user.id,
     type: "WELCOME",
     title: "Welcome to StashUp 🎉",
     body: "Your email is verified. Add a withdrawal account to start a savings circle.",
     link: "/onboarding/withdrawal-account",
   })
   ```

2. **Withdrawal added** — `apps/web/app/api/withdrawal-account/route.ts`, in `POST` after the
   successful upsert (next to the `withdrawal_added` analytics event):
   ```ts
   import { createNotification } from "@/lib/notifications"
   // after upsert succeeds:
   await createNotification({
     userId: session.user.id,
     type: "GENERIC",
     title: "Withdrawal account linked",
     body: `Payouts will be sent to your ${bankName} account.`,
     link: "/",
   })
   ```

3. **Future stubs** — when circle invite/join/payout features are built, call
   `createNotification(...)` from those API routes (e.g. `CIRCLE_INVITE` with
   `link: "/circles/<id>"`). Leave `// TODO(notifications)` markers where those routes will live.

### B9. Notifications acceptance checklist
- [ ] Migration applied; `prisma generate` run; `pnpm --filter web typecheck && lint` pass.
- [ ] No `@workspace/db` import in any `"use client"` file, in `features/*`, or in `lib/api/data/*`
      (the DTO is pure zod).
- [ ] Verifying email creates a WELCOME notification; the bell shows a badge of 1.
- [ ] Opening the popover lists it; clicking it marks it read (badge clears) and navigates to its link.
- [ ] "Mark all read" zeroes the badge.
- [ ] Adding a withdrawal account produces a second notification.
- [ ] A second user never sees another user's notifications (ownership enforced in `where`).

---

## File manifest

**Part A — PostHog**
| Action | Path |
|---|---|
| add deps | `apps/web/package.json` (`posthog-js`, `posthog-node`) |
| env | `apps/web/.env`, `apps/web/.env.example` |
| new | `apps/web/instrumentation-client.ts` |
| new | `apps/web/lib/analytics/events.ts` |
| new | `apps/web/lib/analytics/client.ts` |
| new | `apps/web/lib/analytics/server.ts` |
| new | `apps/web/components/posthog-identify.tsx` |
| edit | `apps/web/components/sign-out-button.tsx` (reset on logout) |
| edit | `apps/web/app/page.tsx` (render `<PostHogIdentify />`) |
| edit | `apps/web/features/auth/forms/sign-up/model.tsx` (`signup_completed` + identify) |
| edit | `apps/web/lib/auth.ts` (`email_verified`) |
| edit | `apps/web/app/api/withdrawal-account/route.ts` (`withdrawal_added`) |
| optional | `apps/web/next.config.ts` (reverse proxy) |

**Part B — Notifications**
| Action | Path |
|---|---|
| edit | `packages/db/prisma/business.prisma` (enum + `Notification` model) |
| edit | `packages/db/prisma/auth.prisma` (`notifications Notification[]` on `User`) |
| new | `apps/web/lib/notifications.ts` |
| new | `apps/web/app/api/notifications/dto/notification.dto.ts` |
| new | `apps/web/app/api/notifications/route.ts` |
| new | `apps/web/app/api/notifications/mark-read/route.ts` |
| new | `apps/web/lib/api/data/notifications/index.ts` |
| new | `apps/web/features/notifications/queries/use-notifications.ts` |
| new | `apps/web/features/notifications/mutations/use-mark-notifications-read.ts` |
| new | `apps/web/features/notifications/components/notification-bell.tsx` |
| edit | `apps/web/app/page.tsx` (render `<NotificationBell />` in nav) |

---

## Out of scope (do NOT do)
- No Novu or any external notification provider.
- No websockets/SSE — 30s polling is sufficient.
- No PostHog session replay, feature flags, experiments, or surveys.
- No PII in analytics (identify by user id only) and none in notification `metadata`.
- Do not import `prisma` outside `app/api/**` and backend libs.

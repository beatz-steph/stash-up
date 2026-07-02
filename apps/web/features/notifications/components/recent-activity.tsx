"use client"

import { useRouter } from "next/navigation"
import { Activity } from "lucide-react"

import { Skeleton } from "@workspace/ui/components/skeleton"
import { useNotifications } from "../queries/use-notifications"
import { useIsOnboarded } from "@/features/onboarding/components/onboarding-provider"
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

const MAX_ITEMS = 6

export function RecentActivity() {
  const router = useRouter()
  const isOnboarded = useIsOnboarded()
  const { data, isLoading } = useNotifications()

  // Activity is meaningless before onboarding; the overview above is blurred there.
  if (!isOnboarded) return null

  const items = (data?.items ?? []).slice(0, MAX_ITEMS)

  const handleClick = (n: Notification) => {
    if (n.link) router.push(n.link)
  }

  return (
    <section className="space-y-4">
      <h2 className="font-su-sans text-su-title-sm font-semibold text-su-ink">
        Recent activity
      </h2>

      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card">
        {isLoading ? (
          <div className="space-y-3 p-su-lg">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-su-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-su-full bg-su-surface-strong text-su-muted">
              <Activity className="h-5 w-5" />
            </span>
            <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
              No activity yet
            </p>
            <p className="font-su-sans text-su-caption text-su-muted">
              Contributions, payouts, and invites will show up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-su-hairline-soft">
            {items.map((n) => {
              const clickable = Boolean(n.link)
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    disabled={!clickable}
                    className={`flex w-full items-start gap-3 px-su-lg py-4 text-left transition-colors ${
                      clickable ? "hover:bg-su-surface-soft" : "cursor-default"
                    }`}
                  >
                    {!n.readAt && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-su-full bg-su-primary" />
                    )}
                    <div className="min-w-0 space-y-0.5">
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
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

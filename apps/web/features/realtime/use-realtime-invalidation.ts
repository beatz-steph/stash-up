"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNotifications } from "@/features/notifications/queries/use-notifications"
import { CIRCLE_QUERY_KEYS } from "@/features/circles/queries"
import type { NotificationTypeDto } from "@/app/api/notifications/dto/notification.dto"

/**
 * Pragmatic "realtime" for a Vercel-serverless app with no websockets/SSE:
 * the notification feed already gets a new row for every domain event that
 * matters (payment received, payout sent, ...), and notification polling is
 * the one thing that's already fast (15s, tab-visible only — see
 * use-notifications.ts). This hook rides that feed as a change signal: when
 * a notification newer than the last one we've seen shows up, it invalidates
 * the query keys whose data that notification type could have changed,
 * instead of also polling circle-detail/transactions/dashboard directly.
 *
 * Mount exactly once, high in the client provider tree (dashboard layout,
 * alongside OnboardingProvider) — NOT per-page, or every page mount would
 * re-fire invalidations for notifications it already reacted to.
 *
 * Future upgrade path: swap the notifications poll for SSE/Pusher; this
 * type -> invalidation map is reused as-is.
 */

const PAYMENT_TYPES = new Set<NotificationTypeDto>([
  "CONTRIBUTION_DUE",
  "CONTRIBUTION_RECEIVED",
])
const PAYOUT_TYPES = new Set<NotificationTypeDto>(["PAYOUT_SENT", "PAYOUT_RECEIVED"])

function invalidationKeysFor(type: NotificationTypeDto): (readonly unknown[])[] | null {
  if (PAYMENT_TYPES.has(type) || PAYOUT_TYPES.has(type)) {
    return [
      CIRCLE_QUERY_KEYS.all, // covers every circle-detail/myCircles/myInvites/virtual-account query (prefix match)
      ["transactions"],
    ]
  }
  return null
}

export function useRealtimeInvalidation() {
  const queryClient = useQueryClient()
  const { items } = useNotifications()
  const newestSeenId = useRef<string | null>(null)
  const isFirstRun = useRef(true)

  useEffect(() => {
    const newest = items[0]
    if (!newest) return

    if (isFirstRun.current) {
      // Don't invalidate on mount — only react to notifications that arrive
      // AFTER we start observing, otherwise every page load re-invalidates
      // everything for a notification the user may have seen minutes ago.
      isFirstRun.current = false
      newestSeenId.current = newest.id
      return
    }

    if (newest.id === newestSeenId.current) return

    // Walk from the top until we hit the last id we'd already seen (or run
    // out of loaded items), invalidating for every notification type in
    // between — covers the case where more than one notification landed
    // between polls.
    const keysToInvalidate = new Set<string>()
    for (const n of items) {
      if (n.id === newestSeenId.current) break
      const keys = invalidationKeysFor(n.type)
      if (keys) {
        for (const key of keys) keysToInvalidate.add(JSON.stringify(key))
      }
    }

    for (const serialized of keysToInvalidate) {
      queryClient.invalidateQueries({ queryKey: JSON.parse(serialized) })
    }

    newestSeenId.current = newest.id
  }, [items, queryClient])
}

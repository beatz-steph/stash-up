import { useInfiniteQuery } from "@tanstack/react-query"
import { fetchNotifications } from "@/lib/api/data/notifications"

export const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const

/**
 * Notification feed, paginated (bell dropdown "Load more"). Public shape is
 * kept compatible with the pre-infinite-query hook (`items`, `unreadCount`,
 * `fetchNextPage`, `hasNextPage`, ...) so notification-bell.tsx and the
 * realtime-invalidation hook (item 5) don't need to know pages exist.
 *
 * Polling: 15s while the tab is visible (guard `typeof document` — this hook
 * also runs during SSR/tests), off when hidden. Refetching an infinite query
 * re-fetches EVERY loaded page, so once the user has paged past page 1 we
 * stop auto-polling (item 5's notification-driven invalidation covers
 * freshness for anyone who has drilled into history; window focus still
 * refetches immediately regardless of page count).
 */
export function useNotifications() {
  const query = useInfiniteQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchNotifications(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (query) =>
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      (query.state.data?.pages.length ?? 0) <= 1
        ? 15_000
        : false,
    refetchOnWindowFocus: true,
  })

  const items = query.data?.pages.flatMap((page) => page.items) ?? []
  // unreadCount is only computed server-side on the first page (see the route
  // handler) — later pages return 0, so always read it off the first page.
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0

  return {
    ...query,
    items,
    unreadCount,
  }
}

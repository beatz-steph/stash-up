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

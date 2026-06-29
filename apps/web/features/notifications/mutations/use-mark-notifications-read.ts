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

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { getWebhooks } from "@/lib/api/data/webhooks"

export const webhookKeys = {
  all: ["webhooks"] as const,
  lists: () => [...webhookKeys.all, "list"] as const,
  list: (params: { page?: number; limit?: number }) =>
    [...webhookKeys.lists(), params] as const,
}

export function useWebhooks(params: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: webhookKeys.list(params),
    queryFn: () => getWebhooks(params),
    placeholderData: keepPreviousData,
  })
}

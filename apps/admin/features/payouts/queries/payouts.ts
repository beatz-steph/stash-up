import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { getPayouts } from "@/lib/api/data/payouts"

export const payoutKeys = {
  all: ["payouts"] as const,
  lists: () => [...payoutKeys.all, "list"] as const,
  list: (params: { page?: number; limit?: number; status?: string }) =>
    [...payoutKeys.lists(), params] as const,
}

export function usePayouts(params: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: payoutKeys.list(params),
    queryFn: () => getPayouts(params),
    placeholderData: keepPreviousData,
  })
}

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { getReconciliationQueue } from "@/lib/api/data/reconciliation"

export const reconciliationKeys = {
  all: ["reconciliation"] as const,
  lists: () => [...reconciliationKeys.all, "list"] as const,
  list: (params: { page?: number; limit?: number }) =>
    [...reconciliationKeys.lists(), params] as const,
}

export function useReconciliationQueue(params: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: reconciliationKeys.list(params),
    queryFn: () => getReconciliationQueue(params),
    placeholderData: keepPreviousData,
  })
}

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { getReconciliationQueue, getOrphanQueue } from "@/lib/api/data/reconciliation"

export const reconciliationKeys = {
  all: ["reconciliation"] as const,
  lists: () => [...reconciliationKeys.all, "list"] as const,
  list: (params: { page?: number; limit?: number }) =>
    [...reconciliationKeys.lists(), params] as const,
  orphans: (params: { page?: number; limit?: number }) =>
    [...reconciliationKeys.all, "orphans", params] as const,
}

export function useReconciliationQueue(params: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: reconciliationKeys.list(params),
    queryFn: () => getReconciliationQueue(params),
    placeholderData: keepPreviousData,
  })
}

export function useOrphanQueue(params: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: reconciliationKeys.orphans(params),
    queryFn: () => getOrphanQueue(params),
    placeholderData: keepPreviousData,
  })
}

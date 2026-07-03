import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { fetchTransactions } from "@/lib/api/data/transactions"

// staleTime keeps the widget/page fresh on tab-switch-back without an extra
// poll (item 5 — realtime invalidation covers actual live updates).
const STALE_TIME_MS = 10_000

export function useTransactions(limit?: number) {
  return useQuery({
    queryKey: ["transactions", limit ?? "all"] as const,
    queryFn: () => fetchTransactions(limit),
    refetchOnWindowFocus: true,
    staleTime: STALE_TIME_MS,
  })
}

const INFINITE_PAGE_LIMIT = 20

/** Full transaction history, paginated. Used by the /transactions page ("Load more"). */
export function useInfiniteTransactions() {
  return useInfiniteQuery({
    queryKey: ["transactions", "infinite"] as const,
    queryFn: ({ pageParam }) => fetchTransactions(INFINITE_PAGE_LIMIT, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    staleTime: STALE_TIME_MS,
  })
}

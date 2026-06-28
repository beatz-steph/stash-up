import { useQuery } from "@tanstack/react-query"
import { fetchBanks } from "@/lib/api/data/banks"

export function useBanks() {
  return useQuery({
    queryKey: ["banks"],
    queryFn: () => fetchBanks(),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours (rarely changes)
    refetchOnWindowFocus: false,
  })
}

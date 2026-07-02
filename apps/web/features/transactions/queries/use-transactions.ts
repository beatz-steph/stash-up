import { useQuery } from "@tanstack/react-query"
import { fetchTransactions } from "@/lib/api/data/transactions"

export function useTransactions(limit?: number) {
  return useQuery({
    queryKey: ["transactions", limit ?? "all"] as const,
    queryFn: () => fetchTransactions(limit),
  })
}

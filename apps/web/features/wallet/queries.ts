import { useQuery } from "@tanstack/react-query"
import { fetchWallet } from "@/lib/api/data/wallet"

export const WALLET_QUERY_KEYS = {
  all: ["wallet"] as const,
  detail: () => [...WALLET_QUERY_KEYS.all, "detail"] as const,
}

/** The signed-in user's wallet (balance + top-up VA + recent ledger). */
export function useWallet() {
  return useQuery({
    queryKey: WALLET_QUERY_KEYS.detail(),
    queryFn: () => fetchWallet(),
  })
}

import { useQuery } from "@tanstack/react-query"
import { fetchWallet, fetchPinStatus } from "@/lib/api/data/wallet"

export const WALLET_QUERY_KEYS = {
  all: ["wallet"] as const,
  detail: () => [...WALLET_QUERY_KEYS.all, "detail"] as const,
  pin: () => [...WALLET_QUERY_KEYS.all, "pin"] as const,
}

/** The signed-in user's wallet (balance + top-up VA + recent ledger). */
export function useWallet() {
  return useQuery({
    queryKey: WALLET_QUERY_KEYS.detail(),
    queryFn: () => fetchWallet(),
  })
}

/** Whether the user has a wallet PIN set. */
export function usePinStatus() {
  return useQuery({
    queryKey: WALLET_QUERY_KEYS.pin(),
    queryFn: () => fetchPinStatus(),
  })
}

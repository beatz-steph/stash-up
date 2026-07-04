import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import { provisionWalletAccount } from "@/lib/api/data/wallet"
import { WALLET_QUERY_KEYS } from "./queries"

/** Provision (or fetch) the dedicated bank top-up account, then refresh. */
export function useProvisionWalletAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => provisionWalletAccount(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all })
    },
    onError: (error) => {
      toast.error(error.message || "Could not set up your top-up account")
    },
  })
}

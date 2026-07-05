import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import {
  provisionWalletAccount,
  topupWalletByCard,
  setWalletPin,
  withdrawFromWallet,
} from "@/lib/api/data/wallet"
import type { WalletTopupReq, WalletWithdrawReq } from "@/app/api/wallet/dto/wallet.dto"
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

/**
 * Top up by card via a one-time Nomba hosted checkout (cards are never saved).
 * Redirects the browser to the checkout link; the wallet is credited on
 * settlement when the user returns.
 */
export function useTopupWalletByCard() {
  return useMutation({
    mutationFn: (body: WalletTopupReq) => topupWalletByCard(body),
    onSuccess: (res) => {
      window.location.href = res.checkoutLink
    },
    onError: (error) => {
      toast.error(error.message || "Could not start the top-up")
    },
  })
}

/** Set the wallet transaction PIN (first time). */
export function useSetWalletPin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pin: string) => setWalletPin(pin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.pin() })
      toast.success("Wallet PIN set")
    },
    onError: (error) => {
      toast.error(error.message || "Could not set PIN")
    },
  })
}

/** Withdraw to the linked bank account. */
export function useWithdrawFromWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: WalletWithdrawReq) => withdrawFromWallet(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all })
      toast.success("Withdrawal is on its way to your bank")
    },
    onError: (error) => {
      toast.error(error.message || "Could not process the withdrawal")
    },
  })
}

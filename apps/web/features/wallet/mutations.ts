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
 * Top up by card. A saved card is charged server-side ("charged" → toast +
 * refresh, balance updates once Nomba confirms); a new card redirects to the
 * hosted checkout ("checkout").
 */
export function useTopupWalletByCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: WalletTopupReq) => topupWalletByCard(body),
    onSuccess: (res) => {
      if (res.mode === "checkout" && res.checkoutLink) {
        window.location.href = res.checkoutLink
        return
      }
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all })
      // otp_required: the dialog hands off to the OTP step — don't toast "charging".
      if (res.mode === "otp_required") return
      toast.success("Charging your card — your balance updates once it's confirmed")
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

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import {
  enrollCard,
  revokeCard,
  linkAutoDebit,
  unlinkAutoDebit,
  toggleWalletAutoDebit,
  submitCardOtp,
  cancelCardOtp,
} from "@/lib/api/data/cards"
import type { EnrollCardReq, LinkAutoDebitReq } from "@/app/api/cards/dto/cards.dto"
import type { CardOtpReq, CardOtpCancelReq } from "@/app/api/cards/otp/dto/card-otp.dto"
import { CARD_QUERY_KEYS } from "./queries"
import { CIRCLE_QUERY_KEYS } from "../circles/queries"
import { WALLET_QUERY_KEYS } from "../wallet/queries"

/**
 * Start a tokenizing checkout to add a new card, then redirect the browser to
 * Nomba's hosted checkout. The SavedCard is created on webhook settlement.
 */
export function useEnrollCard() {
  return useMutation({
    mutationFn: (body: EnrollCardReq) => enrollCard(body),
    onSuccess: (res) => {
      // Full navigation to the hosted checkout — leaves the app.
      window.location.href = res.checkoutLink
    },
    onError: (error) => {
      toast.error(error.message || "Could not start card checkout")
    },
  })
}

export function useRevokeCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeCard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CARD_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.all })
      toast.success("Card removed")
    },
    onError: (error) => {
      toast.error(error.message || "Could not remove card")
    },
  })
}

export function useLinkAutoDebit(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: LinkAutoDebitReq) => linkAutoDebit(circleId, body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      queryClient.invalidateQueries({ queryKey: CARD_QUERY_KEYS.all })
      toast.success(
        res.chargeInitiated
          ? "Auto-save on — collecting this cycle's contribution now"
          : "Auto-save on for this circle"
      )
    },
    onError: (error) => {
      toast.error(error.message || "Could not enable auto-save")
    },
  })
}

export function useUnlinkAutoDebit(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => unlinkAutoDebit(circleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      queryClient.invalidateQueries({ queryKey: CARD_QUERY_KEYS.all })
      toast.success("Auto-save turned off for this circle")
    },
    onError: (error) => {
      toast.error(error.message || "Could not turn off auto-save")
    },
  })
}

/**
 * Submit the OTP for a 3DS-gated tokenized card charge (pay-now / saved-card
 * top-up). On success Nomba completes the charge and the settlement webhook
 * credits the wallet / applies the contribution — so we refresh both.
 */
export function useSubmitCardOtp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CardOtpReq) => submitCardOtp(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.all })
      toast.success("OTP confirmed — your payment is completing")
    },
    // Errors are surfaced inline in the OTP dialog, not toasted.
  })
}

/**
 * Abandon an OTP-gated charge (customer closed the OTP dialog) so the still-
 * PENDING attempt is failed and an immediate retry isn't blocked. Fire-and-
 * forget — nothing to toast.
 */
export function useCancelCardOtp() {
  return useMutation({
    mutationFn: (body: CardOtpCancelReq) => cancelCardOtp(body),
  })
}

export function useToggleWalletAutoDebit(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => toggleWalletAutoDebit(circleId, { enabled }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      queryClient.invalidateQueries({ queryKey: ["wallet"] })
      if (res.autoDebitWallet) {
        toast.success(
          res.collectedMinor > 0
            ? "Wallet auto-save on — collected this cycle from your wallet"
            : "Wallet auto-save on for this circle"
        )
      } else {
        toast.success("Wallet auto-save off for this circle")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Could not update wallet auto-save")
    },
  })
}

"use client"

import { useMutation } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import {
  requestWithdrawalOtp,
  saveWithdrawalAccount,
} from "@/lib/api/data/withdrawal-account"
import type { SaveWithdrawalAccountReq } from "@/app/api/withdrawal-account/dto/withdrawal-account.dto"

/** Request the emailed OTP needed to change an existing payout account. */
export function useRequestWithdrawalOtp() {
  return useMutation({
    mutationFn: () => requestWithdrawalOtp(),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not send code")
    },
  })
}

/**
 * Save the changed payout account (requires the OTP in the body).
 *
 * Forces a full browser reload on success instead of a query invalidation —
 * a client-side refresh was found to leave onboarding state (banner,
 * OnboardingProvider) stale elsewhere in the app after the withdrawal
 * account changes. The success toast is dropped because window.location.reload()
 * tears down the toast host before it can be seen; the dialog closing +
 * reload is itself the feedback.
 */
export function useUpdateWithdrawalAccount(onSuccess?: () => void) {
  return useMutation({
    mutationFn: (body: SaveWithdrawalAccountReq) => saveWithdrawalAccount(body),
    onSuccess: () => {
      onSuccess?.()
      window.location.reload()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update account")
    },
  })
}

"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
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

/** Save the changed payout account (requires the OTP in the body). */
export function useUpdateWithdrawalAccount(onSuccess?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SaveWithdrawalAccountReq) => saveWithdrawalAccount(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["withdrawal-account"] })
      toast.success("Payout account updated")
      onSuccess?.()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update account")
    },
  })
}

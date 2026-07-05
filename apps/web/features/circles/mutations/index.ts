import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import {
  createCircle,
  cancelCircle,
  leaveCircle,
  inviteToCircle,
  cancelInvite,
  acceptInvite,
  declineInvite,
  activateCircle,
  retryProvisioning,
  triggerPayout,
  renewCircle,
  payCircleNow,
  type CreateCircleInput,
  type InviteInput,
} from "@/lib/api/data/circles"
import type { PayNowReq } from "@/app/api/circles/[id]/pay-now/dto/pay-now.dto"
import { CIRCLE_QUERY_KEYS } from "../queries"
import { WALLET_QUERY_KEYS } from "@/features/wallet/queries"

export function useActivateCircle(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => activateCircle(circleId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      if (res.activated) {
        toast.success("Circle activated successfully!")
      } else {
        toast.warning("Activation partial failure, please retry")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to activate circle")
    },
  })
}

export function useRetryProvisioning(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => retryProvisioning(circleId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      if (res.activated) {
        toast.success("Retry successful, circle activated!")
      } else {
        toast.warning("Retry partial failure, please try again")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to retry provisioning")
    },
  })
}

export function useCreateCircle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateCircleInput) => createCircle(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.myCircles() })
      toast.success("Circle created successfully")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create circle")
    },
  })
}

export function useCancelCircle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cancelCircle(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.myCircles() })
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(id) })
      toast.success("Circle cancelled")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel circle")
    },
  })
}

export function useLeaveCircle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => leaveCircle(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.myCircles() })
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(id) })
      toast.success("Left the circle")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to leave circle")
    },
  })
}

export function useInviteToCircle(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: InviteInput) => inviteToCircle(circleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      toast.success("Invite sent successfully")
    },
    // We don't automatically toast error here because the UI form handles it inline
  })
}

export function useCancelInvite(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: string) => cancelInvite(circleId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      toast.success("Invite cancelled")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel invite")
    },
  })
}

export function useAcceptInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => acceptInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.myInvites() })
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.myCircles() })
      toast.success("Invite accepted! Welcome to the circle.")
    },
    // Don't toast error so the invite card can handle 409 inline
  })
}

export function useDeclineInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => declineInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.myInvites() })
      toast.success("Invite declined")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to decline invite")
    },
  })
}

export function useTriggerPayout(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cycleId: string) => triggerPayout(circleId, cycleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      toast.success("Payout initiated successfully")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to initiate payout")
    },
  })
}

export function useRenewCircle(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => renewCircle(circleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      toast.success("Circle renewed — a new rotation has started")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to renew circle")
    },
  })
}

/** Pay the current cycle's due amount now — from wallet (instant) or card
 * (settles shortly via webhook). Refreshes the circle + wallet. */
export function usePayCircleNow(circleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PayNowReq) => payCircleNow(circleId, body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: CIRCLE_QUERY_KEYS.detail(circleId) })
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all })
      toast.success(
        res.status === "APPLIED"
          ? "Paid from your wallet"
          : "Charging your card — your contribution updates once it's confirmed"
      )
    },
    onError: (error) => {
      toast.error(error.message || "Could not complete the payment")
    },
  })
}

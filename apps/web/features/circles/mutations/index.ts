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
  type CreateCircleInput,
  type InviteInput,
} from "@/lib/api/data/circles"
import { CIRCLE_QUERY_KEYS } from "../queries"

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

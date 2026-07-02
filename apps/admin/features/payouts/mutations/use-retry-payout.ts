"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import { retryPayout } from "@/lib/api/data/payouts"

export function useRetryPayoutMutation(payoutId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => retryPayout(payoutId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payouts"] })
      toast.success("Retry request recorded")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to request retry")
    },
  })
}

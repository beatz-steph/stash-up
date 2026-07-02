"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import { resolveTransfer } from "@/lib/api/data/reconciliation"

interface ResolveTransferParams {
  matchedCycleId?: string
  matchedMembershipId?: string
}

export function useResolveTransferMutation(transferId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ResolveTransferParams) => resolveTransfer(transferId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] })
      toast.success("Transfer manually resolved")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to resolve transfer")
    },
  })
}

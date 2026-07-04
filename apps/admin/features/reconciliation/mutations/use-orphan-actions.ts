"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import { resolveOrphan, ignoreOrphan } from "@/lib/api/data/reconciliation"

export function useResolveOrphan(orphanId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { note?: string }) => resolveOrphan(orphanId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] })
      toast.success("Orphan replayed into the member's contribution")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to replay orphan")
    },
  })
}

export function useIgnoreOrphan(orphanId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { note: string }) => ignoreOrphan(orphanId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] })
      toast.success("Orphan ignored")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to ignore orphan")
    },
  })
}

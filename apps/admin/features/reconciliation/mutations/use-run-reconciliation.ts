"use client"
import { useMutation } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import { runTreasuryReconciliation } from "@/lib/api/data/reconciliation"

/**
 * Run treasury reconciliation on demand. Returns the report; the caller renders
 * it. Errors are toasted (the endpoint may be misconfigured or unreachable).
 */
export function useRunReconciliation() {
  return useMutation({
    mutationFn: () => runTreasuryReconciliation(),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not run reconciliation")
    },
  })
}

"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import { toggleConfigStatus } from "@/lib/api/data/config"

// Local union — avoids importing the server-only @workspace/db into a client hook.
type ConfigStatus = "ACTIVE" | "INVALID"

export function useToggleConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (status: ConfigStatus) => toggleConfigStatus(status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] })
      toast.success("Nomba configuration status updated")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update configuration")
    },
  })
}

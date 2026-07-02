"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@workspace/ui/components/sonner"
import { blockUser } from "@/lib/api/data/users"

export function useBlockUserMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (blocked: boolean) => blockUser(userId, blocked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      toast.success("User status updated")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update user status")
    },
  })
}

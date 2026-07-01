import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { saveWithdrawalAccount } from "@/lib/api/data/withdrawal-account"
import { toast } from "@workspace/ui/components/sonner"
import type { SaveWithdrawalAccountReq } from "@/app/api/withdrawal-account/dto/withdrawal-account.dto"

export function useSaveWithdrawalAccount(onSuccess?: () => void) {
  const router = useRouter()

  return useMutation({
    mutationFn: (body: SaveWithdrawalAccountReq) => saveWithdrawalAccount(body),
    onSuccess: () => {
      toast.success("Withdrawal account saved successfully")
      if (onSuccess) {
        onSuccess()
      } else {
        router.push("/")
      }
      router.refresh()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save account")
    },
  })
}

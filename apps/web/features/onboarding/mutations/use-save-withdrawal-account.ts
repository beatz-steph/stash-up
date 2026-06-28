import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { saveWithdrawalAccount } from "@/lib/api/data/withdrawal-account"
import { toast } from "@workspace/ui/components/sonner"
import type { SaveWithdrawalAccountReq } from "@/app/api/withdrawal-account/dto/withdrawal-account.dto"

export function useSaveWithdrawalAccount() {
  const router = useRouter()

  return useMutation({
    mutationFn: (body: SaveWithdrawalAccountReq) => saveWithdrawalAccount(body),
    onSuccess: () => {
      toast.success("Withdrawal account saved successfully")
      router.push("/")
      router.refresh()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save account")
    },
  })
}

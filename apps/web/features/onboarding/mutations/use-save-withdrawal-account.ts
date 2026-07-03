import { useMutation } from "@tanstack/react-query"
import { saveWithdrawalAccount } from "@/lib/api/data/withdrawal-account"
import { toast } from "@workspace/ui/components/sonner"
import type { SaveWithdrawalAccountReq } from "@/app/api/withdrawal-account/dto/withdrawal-account.dto"

// Force a full browser navigation (not router.push/refresh) so every piece of
// server-rendered onboarding state — the banner prop from app/(dashboard)/page.tsx,
// OnboardingProvider's isOnboarded from the layout — is guaranteed fresh. A
// client-side refresh was found to leave the "add withdrawal account" banner
// showing stale state after save. The success toast is intentionally dropped:
// a window.location navigation tears down the toast host before it can be
// seen, and the banner disappearing is itself the success feedback.
export function useSaveWithdrawalAccount(onSuccess?: () => void) {
  return useMutation({
    mutationFn: (body: SaveWithdrawalAccountReq) => saveWithdrawalAccount(body),
    onSuccess: () => {
      if (onSuccess) {
        // Close the triggering modal first, then hard-reload so the
        // onboarding banner/provider re-render with fresh server state.
        onSuccess()
        window.location.reload()
      } else {
        window.location.assign("/")
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save account")
    },
  })
}

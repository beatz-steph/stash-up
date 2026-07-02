"use client"

import { Button } from "@workspace/ui/components/button"
import { authClient } from "@/lib/auth-client"
import { resetUser } from "@/lib/analytics/client"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function SignOutButton() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)

  const handleSignOut = async () => {
    setIsPending(true)
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          queryClient.clear()
          localStorage.clear()
          resetUser()
          router.push("/sign-in")
          router.refresh()
        },
      },
    })
    setIsPending(false)
  }

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={handleSignOut}
      className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer"
    >
      {isPending ? "Signing out..." : "Sign Out"}
    </Button>
  )
}

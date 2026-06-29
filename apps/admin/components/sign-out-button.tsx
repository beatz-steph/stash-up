"use client"

import { Button } from "@workspace/ui/components/button"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function SignOutButton() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const handleSignOut = async () => {
    setIsPending(true)
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login")
          router.refresh()
        },
      },
    })
    setIsPending(false)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleSignOut}
      className="bg-su-canvas border-su-hairline text-su-body hover:bg-su-surface-soft hover:text-su-ink font-su-sans"
    >
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  )
}

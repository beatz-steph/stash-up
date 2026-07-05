"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { toast } from "@workspace/ui/components/sonner"

/** Sign the user out after this much inactivity (money app → short window). */
const IDLE_MS = 15 * 60 * 1000

/**
 * Auto-logout on idle. Any interaction resets a 15-minute timer; when it fires,
 * we sign out and send the user to /sign-in. Mounted inside the authenticated
 * shell only, so it never runs for signed-out visitors. Renders nothing.
 */
export function IdleLogout() {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const signingOut = useRef(false)

  useEffect(() => {
    async function logout() {
      if (signingOut.current) return
      signingOut.current = true
      try {
        await authClient.signOut()
      } catch {
        // Sign-out is best-effort; we still bounce to the sign-in page.
      }
      toast.message("Signed out", {
        description: "You were signed out after 15 minutes of inactivity.",
      })
      router.push("/sign-in")
      router.refresh()
    }

    function reset() {
      if (signingOut.current) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(logout, IDLE_MS)
    }

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset))
      if (timer.current) clearTimeout(timer.current)
    }
  }, [router])

  return null
}

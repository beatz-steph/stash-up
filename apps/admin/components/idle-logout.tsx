"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { toast } from "@workspace/ui/components/sonner"

/** Admins touch money and user data — keep the idle window short. */
const IDLE_MS = 15 * 60 * 1000

/**
 * Auto-logout on idle for the admin panel. Any interaction resets a 15-minute
 * timer; when it fires we sign out and return to /login. Mounted inside the
 * authenticated shell only. Renders nothing.
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
        // best-effort; still bounce to login
      }
      toast.message("Signed out", {
        description: "You were signed out after 15 minutes of inactivity.",
      })
      router.push("/login")
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

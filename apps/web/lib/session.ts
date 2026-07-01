import "server-only"
import { auth } from "./auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

/**
 * Validates the current session safely. Returns the session if authenticated, or null if unauthenticated.
 * Use this in API routes or Server Actions where you want to handle the unauthenticated state manually
 * (e.g., returning a 401 response).
 */
export async function getSession() {
  return await auth.api.getSession({ headers: await headers() })
}

/**
 * Strictly requires the current session. Returns the session if authenticated.
 * If unauthenticated, it automatically redirects the user to the `/sign-in` page.
 * Use this in Server Components (Pages) where unauthenticated access should be completely blocked.
 */
export async function requireSession() {
  const session = await getSession()
  if (!session) {
    redirect("/sign-in")
  }
  return session
}

import { createAuthClient } from "better-auth/react"
import { inferAdditionalFields } from "better-auth/client/plugins"
import type { auth } from "./auth"

export const authClient = createAuthClient({
  // Unset → same-origin. Avoids a hardcoded port that breaks when the app
  // is served elsewhere. Set NEXT_PUBLIC_ADMIN_BETTER_AUTH_URL to override.
  baseURL: process.env.NEXT_PUBLIC_ADMIN_BETTER_AUTH_URL,
  plugins: [inferAdditionalFields<typeof auth>()],
})

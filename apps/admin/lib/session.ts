import { cache } from "react"
import { headers } from "next/headers"
import { auth } from "./auth"

/**
 * Per-request memoized admin session. React `cache()` dedupes the lookup so the
 * layout and page in the same render share a single getSession call.
 */
export const getAdminSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

import { PostHog } from "posthog-node"
import type { AnalyticsEvent, AnalyticsProps } from "./events"
import { isAnalyticsEnabled } from "./config"

let client: PostHog | null = null

function getServerClient(): PostHog | null {
  if (!isAnalyticsEnabled()) return null
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return null
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return client
}

/** Fire-and-flush a server-side event. Never throws into the caller. */
export async function captureServer(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: AnalyticsProps,
) {
  const ph = getServerClient()
  if (!ph) return
  try {
    ph.capture({ distinctId, event, properties })
    await ph.flush()
  } catch {
    // analytics must never break the request
  }
}

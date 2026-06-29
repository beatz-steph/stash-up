import posthog from "posthog-js"
import type { AnalyticsEvent, AnalyticsProps } from "./events"

export function track(event: AnalyticsEvent, properties?: AnalyticsProps) {
  if (typeof window === "undefined") return
  posthog.capture(event, properties)
}

export function identifyUser(userId: string) {
  if (typeof window === "undefined") return
  posthog.identify(userId)
}

export function resetUser() {
  if (typeof window === "undefined") return
  posthog.reset()
}

import posthog from "posthog-js"
import { isAnalyticsEnabled } from "./lib/analytics/config"

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (key && isAnalyticsEnabled()) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-05-30",
  })
}

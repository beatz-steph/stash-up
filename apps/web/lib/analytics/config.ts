export function isAnalyticsEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_POSTHOG !== undefined) {
    return process.env.NEXT_PUBLIC_ENABLE_POSTHOG === "true"
  }
  return process.env.NODE_ENV === "production"
}

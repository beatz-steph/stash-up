/** Canonical analytics event names. Add new events here so call sites stay typed. */
export const AnalyticsEvent = {
  SignupCompleted: "signup_completed",
  EmailVerified: "email_verified",
  WithdrawalAdded: "withdrawal_added",
  CircleCreated: "circle_created",
  CircleJoined: "circle_joined",
} as const

export type AnalyticsEvent = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent]

/** Allowed, non‑PII event properties. Never add email/name/phone/raw amounts. */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>

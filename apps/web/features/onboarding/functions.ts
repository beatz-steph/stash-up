/**
 * Onboarding UI helpers — safe to import from client OR server.
 * The OnboardingStatus contract lives with the other API DTOs in app/api/onboarding/dto.
 */
import type { OnboardingStatus } from "@/app/api/onboarding/dto/status.dto"

/** All setup steps done → the user may create or be added to a circle. */
export function isOnboardingComplete(status: OnboardingStatus): boolean {
  return status.account && status.verified && status.withdrawal
}

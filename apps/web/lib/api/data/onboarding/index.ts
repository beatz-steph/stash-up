import { api, type ApiOptions } from "../../client"
import type { OnboardingStatus } from "../../../../app/api/onboarding/dto/status.dto"

export function fetchOnboardingStatus(options?: ApiOptions) {
  return api.get<OnboardingStatus>("/api/onboarding/status", options)
}

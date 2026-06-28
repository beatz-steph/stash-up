import { api, type ApiOptions } from "../../client"
import { OnboardingStatusSchema } from "@/app/api/onboarding/dto/status.dto"

export function fetchOnboardingStatus(options?: ApiOptions) {
  return api.get("/api/onboarding/status", OnboardingStatusSchema, options)
}

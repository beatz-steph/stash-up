import { api, type ApiOptions } from "../../client"
import { metricsResponseSchema } from "@/app/api/metrics/dto/metrics.dto"

export function getMetrics(options?: ApiOptions) {
  return api.get("/api/metrics", metricsResponseSchema, options)
}

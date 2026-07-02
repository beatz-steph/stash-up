import { api, type ApiOptions } from "../client"
import { configResponseSchema } from "@/app/api/config/dto/config.dto"

export async function getConfig(options?: ApiOptions) {
  return api.get(`/api/config`, configResponseSchema, options)
}

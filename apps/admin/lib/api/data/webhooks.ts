import { api, type ApiOptions } from "../client"
import { webhookListResponseSchema } from "@/app/api/webhooks/dto/webhooks.dto"

export async function getWebhooks(
  params: { page?: number; limit?: number },
  options?: ApiOptions
) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", params.page.toString())
  if (params.limit) searchParams.set("limit", params.limit.toString())

  return api.get(`/api/webhooks?${searchParams.toString()}`, webhookListResponseSchema, options)
}

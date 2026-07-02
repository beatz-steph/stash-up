import { api, type ApiOptions } from "../client"
import { payoutListResponseSchema } from "@/app/api/payouts/dto/payouts.dto"

export async function getPayouts(
  params: { page?: number; limit?: number; status?: string },
  options?: ApiOptions
) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", params.page.toString())
  if (params.limit) searchParams.set("limit", params.limit.toString())
  if (params.status) searchParams.set("status", params.status)

  return api.get(`/api/payouts?${searchParams.toString()}`, payoutListResponseSchema, options)
}

export async function retryPayout(id: string, options?: ApiOptions) {
  return api.post(`/api/payouts/${id}/retry`, undefined, undefined, options)
}

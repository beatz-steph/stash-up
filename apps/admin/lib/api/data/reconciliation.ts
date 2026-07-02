import { api, type ApiOptions } from "../client"
import { reconciliationListResponseSchema } from "@/app/api/reconciliation/dto/reconciliation.dto"

export async function getReconciliationQueue(
  params: { page?: number; limit?: number },
  options?: ApiOptions
) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", params.page.toString())
  if (params.limit) searchParams.set("limit", params.limit.toString())

  return api.get(`/api/reconciliation?${searchParams.toString()}`, reconciliationListResponseSchema, options)
}

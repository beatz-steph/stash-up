import { api, type ApiOptions } from "../client"
import { reconciliationListResponseSchema } from "@/app/api/reconciliation/dto/reconciliation.dto"
import { orphanListResponseSchema } from "@/app/api/reconciliation/orphans/dto/orphan.dto"

export async function getReconciliationQueue(
  params: { page?: number; limit?: number },
  options?: ApiOptions
) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", params.page.toString())
  if (params.limit) searchParams.set("limit", params.limit.toString())

  return api.get(`/api/reconciliation?${searchParams.toString()}`, reconciliationListResponseSchema, options)
}

export async function resolveTransfer(
  id: string,
  data: { matchedCycleId?: string; matchedMembershipId?: string },
  options?: ApiOptions
) {
  return api.post(`/api/reconciliation/${id}/resolve`, data, undefined, options)
}

export async function getOrphanQueue(
  params: { page?: number; limit?: number },
  options?: ApiOptions
) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", params.page.toString())
  if (params.limit) searchParams.set("limit", params.limit.toString())

  return api.get(
    `/api/reconciliation/orphans?${searchParams.toString()}`,
    orphanListResponseSchema,
    options
  )
}

export async function resolveOrphan(id: string, data: { note?: string }, options?: ApiOptions) {
  return api.post(`/api/reconciliation/orphans/${id}/resolve`, data, undefined, options)
}

export async function ignoreOrphan(id: string, data: { note: string }, options?: ApiOptions) {
  return api.post(`/api/reconciliation/orphans/${id}/ignore`, data, undefined, options)
}

import { api, type ApiOptions } from "../client"
import { auditListResponseSchema } from "@/app/api/audit/dto/audit.dto"

export async function getAuditLogs(
  params: { page?: number; limit?: number },
  options?: ApiOptions
) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", params.page.toString())
  if (params.limit) searchParams.set("limit", params.limit.toString())

  return api.get(`/api/audit?${searchParams.toString()}`, auditListResponseSchema, options)
}

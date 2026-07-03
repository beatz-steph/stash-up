import { api, type ApiOptions } from "../../client"
import type { TransactionListRes } from "@/app/api/transactions/dto/transaction.dto"

export function fetchTransactions(
  limit?: number,
  cursor?: string | null,
  options?: ApiOptions
) {
  const params = new URLSearchParams()
  if (limit) params.set("limit", String(limit))
  if (cursor) params.set("cursor", cursor)
  const qs = params.toString()
  return api.get<TransactionListRes>(`/api/transactions${qs ? `?${qs}` : ""}`, options)
}

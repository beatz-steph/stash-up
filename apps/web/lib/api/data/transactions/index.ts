import { api, type ApiOptions } from "../../client"
import type { TransactionListRes } from "@/app/api/transactions/dto/transaction.dto"

export function fetchTransactions(limit?: number, options?: ApiOptions) {
  const qs = limit ? `?limit=${limit}` : ""
  return api.get<TransactionListRes>(`/api/transactions${qs}`, options)
}

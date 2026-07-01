import { api, type ApiOptions } from "../../client"
import type {
  WithdrawalAccount,
  ResolveAccountRes,
  SaveWithdrawalAccountReq,
  ResolveAccountReq,
} from "@/app/api/withdrawal-account/dto/withdrawal-account.dto"

export function fetchWithdrawalAccount(options?: ApiOptions) {
  return api.get<WithdrawalAccount | null>("/api/withdrawal-account", options)
}

export function saveWithdrawalAccount(body: SaveWithdrawalAccountReq, options?: ApiOptions) {
  return api.post<WithdrawalAccount>("/api/withdrawal-account", body, options)
}

export function resolveAccountName(body: ResolveAccountReq, options?: ApiOptions) {
  return api.post<ResolveAccountRes>("/api/withdrawal-account/resolve", body, options)
}

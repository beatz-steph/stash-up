import { api, type ApiOptions } from "../../client"
import {
  WithdrawalAccountSchema,
  ResolveAccountResSchema,
  type SaveWithdrawalAccountReq,
  type ResolveAccountReq,
} from "@/app/api/withdrawal-account/dto/withdrawal-account.dto"

export function fetchWithdrawalAccount(options?: ApiOptions) {
  return api.get("/api/withdrawal-account", WithdrawalAccountSchema.nullable(), options)
}

export function saveWithdrawalAccount(body: SaveWithdrawalAccountReq, options?: ApiOptions) {
  return api.post("/api/withdrawal-account", body, WithdrawalAccountSchema, options)
}

export function resolveAccountName(body: ResolveAccountReq, options?: ApiOptions) {
  return api.post("/api/withdrawal-account/resolve", body, ResolveAccountResSchema, options)
}

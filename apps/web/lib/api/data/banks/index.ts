import { api, type ApiOptions } from "../../client"
import type { Bank } from "@/app/api/banks/dto/bank.dto"

export function fetchBanks(options?: ApiOptions) {
  return api.get<Bank[]>("/api/banks", options)
}

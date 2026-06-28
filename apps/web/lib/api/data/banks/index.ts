import { z } from "zod"
import { api, type ApiOptions } from "../../client"
import { BankSchema } from "@/app/api/banks/dto/bank.dto"

export function fetchBanks(options?: ApiOptions) {
  return api.get("/api/banks", z.array(BankSchema), options)
}

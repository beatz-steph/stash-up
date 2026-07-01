import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"
import { ResolveAccountReqSchema, type ResolveAccountRes } from "../dto/withdrawal-account.dto"
import { validateRequestBody } from "@/lib/api/validate"
import { resolveBankAccount } from "@/lib/nomba-client"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return apiError("Unauthorized", 401)
  }

  const validation = await validateRequestBody(request, ResolveAccountReqSchema)
  if (!validation.success) {
    return validation.errorResponse
  }

  const { accountNumber, bankCode } = validation.data

  try {
    const { accountName } = await resolveBankAccount({ accountNumber, bankCode })
    return apiSuccess<ResolveAccountRes>({ accountName })
  } catch {
    return apiError(
      "Could not verify this account. Check the details.",
      422
    )
  }
}

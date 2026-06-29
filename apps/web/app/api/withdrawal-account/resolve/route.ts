import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { ResolveAccountReqSchema } from "../dto/withdrawal-account.dto"
import { validateRequestBody } from "@/lib/api/validate"
import { resolveBankAccount } from "@/lib/nomba-client"

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const validation = await validateRequestBody(request, ResolveAccountReqSchema)
  if (!validation.success) {
    return validation.errorResponse
  }

  const { accountNumber, bankCode } = validation.data

  try {
    const { accountName } = await resolveBankAccount({ accountNumber, bankCode })
    return NextResponse.json({ accountName })
  } catch {
    return NextResponse.json(
      { error: "Could not verify this account. Check the details." },
      { status: 422 },
    )
  }
}

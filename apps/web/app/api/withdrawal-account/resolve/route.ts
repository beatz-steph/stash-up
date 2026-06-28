import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { ResolveAccountReqSchema } from "../dto/withdrawal-account.dto"
import { validateRequestBody } from "@/lib/api/validate"

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const validation = await validateRequestBody(request, ResolveAccountReqSchema)
  if (!validation.success) {
    return validation.errorResponse
  }

  const { accountNumber } = validation.data

  // Sandbox name enquiry — replace with Nomba's name-enquiry call in production.
  await new Promise((resolve) => setTimeout(resolve, 1000))

  if (accountNumber === "0000000000") {
    return NextResponse.json(
      { error: "Could not verify this account. Check the details." },
      { status: 422 },
    )
  }

  return NextResponse.json({ accountName: "Aisha Bello" })
}

import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"
import { prisma } from "@workspace/db"
import { requireVerifiedEmail } from "@/lib/access-control"
import { SaveWithdrawalAccountReqSchema, type WithdrawalAccount } from "./dto/withdrawal-account.dto"
import { validateRequestBody } from "@/lib/api/validate"
import { captureServer } from "@/lib/analytics/server"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { createNotification } from "@/lib/notifications"

const accountSelect = {
  bankCode: true,
  bankName: true,
  accountNumber: true,
  accountName: true,
} as const

export async function GET() {
  const session = await getSession()
  if (!session) {
    return apiError("Unauthorized", 401)
  }

  const account = await prisma.withdrawalAccount.findUnique({
    where: { userId: session.user.id },
    select: accountSelect,
  })
  return apiSuccess<WithdrawalAccount | null>(account)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return apiError("Unauthorized", 401)
  }

  // Money boundary: email must be verified before linking a payout account.
  try {
    requireVerifiedEmail(session.user)
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Email not verified",
      403
    )
  }

  const validation = await validateRequestBody(request, SaveWithdrawalAccountReqSchema)
  if (!validation.success) {
    return validation.errorResponse
  }

  const { bankCode, bankName, accountNumber, accountName } = validation.data
  try {
    const record = await prisma.withdrawalAccount.upsert({
      where: { userId: session.user.id },
      update: { bankCode, bankName, accountNumber, accountName },
      create: { userId: session.user.id, bankCode, bankName, accountNumber, accountName },
      select: accountSelect,
    })
    
    await captureServer(session.user.id, AnalyticsEvent.WithdrawalAdded)
    await createNotification({
      userId: session.user.id,
      type: "GENERIC",
      title: "Withdrawal account linked",
      body: `Payouts will be sent to your ${bankName} account.`,
      link: "/",
    })
    
    return apiSuccess<WithdrawalAccount>(record)
  } catch (error) {
    console.error("Error saving withdrawal account:", error)
    return apiError("Failed to save withdrawal account", 500)
  }
}

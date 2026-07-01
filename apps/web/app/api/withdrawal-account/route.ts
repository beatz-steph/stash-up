import { getSession } from "@/lib/session"
import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireVerifiedEmail } from "@/lib/access-control"
import { SaveWithdrawalAccountReqSchema } from "./dto/withdrawal-account.dto"
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const account = await prisma.withdrawalAccount.findUnique({
    where: { userId: session.user.id },
    select: accountSelect,
  })
  return NextResponse.json(account)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Money boundary: email must be verified before linking a payout account.
  try {
    requireVerifiedEmail(session.user)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email not verified" },
      { status: 403 },
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
    
    return NextResponse.json(record)
  } catch (error) {
    console.error("Error saving withdrawal account:", error)
    return NextResponse.json({ error: "Failed to save withdrawal account" }, { status: 500 })
  }
}

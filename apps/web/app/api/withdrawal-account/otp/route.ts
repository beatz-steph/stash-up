import { apiSuccess, apiError } from "@/lib/api/response"
import { getSession } from "@/lib/session"
import { prisma } from "@workspace/db"
import { requireVerifiedEmail } from "@/lib/access-control"
import { sendEmail } from "@/lib/email/send"
import { WithdrawalOtpEmail } from "@/lib/email/templates/withdrawal-otp"
import {
  generateOtpCode,
  hashOtpCode,
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
} from "@/lib/withdrawal-otp"
import type { WithdrawalOtpRes } from "../dto/withdrawal-account.dto"

/**
 * Request an email OTP required to CHANGE an existing withdrawal account.
 * Only issued when the user already has a linked account (first-time linking
 * needs no OTP). The code is emailed; only its hash is stored.
 */
export async function POST() {
  const session = await getSession()
  if (!session) {
    return apiError("Unauthorized", 401)
  }

  try {
    requireVerifiedEmail(session.user)
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Email not verified", 403)
  }

  const userId = session.user.id

  const existing = await prisma.withdrawalAccount.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!existing) {
    return apiError("No withdrawal account to change. Link one first.", 400)
  }

  // Rate-limit resends.
  const currentOtp = await prisma.withdrawalAccountOtp.findUnique({
    where: { userId },
    select: { createdAt: true },
  })
  if (currentOtp && Date.now() - currentOtp.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return apiError("A code was just sent. Please wait a moment before requesting another.", 429)
  }

  const code = generateOtpCode()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)

  await prisma.withdrawalAccountOtp.upsert({
    where: { userId },
    update: { codeHash: hashOtpCode(code), expiresAt, attempts: 0, createdAt: new Date() },
    create: { userId, codeHash: hashOtpCode(code), expiresAt },
  })

  const expiresInMinutes = Math.round(OTP_TTL_MS / 60000)

  // Dev-only convenience: without Resend configured the email never arrives, so
  // surface the code in the server console to unblock local testing. NEVER logs
  // in production (would leak a live credential).
  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] withdrawal-account OTP for ${userId}: ${code}`)
  }

  await sendEmail({
    to: session.user.email,
    subject: "Your StashUp payout-account change code",
    react: WithdrawalOtpEmail({ code, expiryMinutes: expiresInMinutes }),
  })

  return apiSuccess<WithdrawalOtpRes>({ sent: true, expiresInMinutes })
}

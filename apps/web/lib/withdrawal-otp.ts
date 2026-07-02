import "server-only"
import crypto from "crypto"

// A user must confirm an emailed one-time code before CHANGING an existing
// withdrawal account (the payout destination). First-time linking is unaffected.
export const OTP_TTL_MS = 10 * 60 * 1000 // code valid for 10 minutes
export const OTP_MAX_ATTEMPTS = 5 // wrong-code attempts before the code is burned
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000 // min gap between resend requests

/** Cryptographically-random, zero-padded 6-digit code. */
export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0")
}

/** sha256 of the code — only the hash is ever stored. Compared timing-safe. */
export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex")
}

export function otpMatches(inputCode: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtpCode(inputCode))
  const b = Buffer.from(storedHash)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

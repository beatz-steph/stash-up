import "server-only";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@workspace/db";

/**
 * Wallet transaction PIN — gates withdrawals. Only a scrypt hash is stored
 * (scrypt is deliberately slow, which matters for a tiny 4–6 digit space —
 * sha256 would be brute-forceable). Failed attempts lock the PIN like the
 * withdrawal-account OTP. NEVER log the plaintext PIN.
 */

export const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const PIN_RE = /^\d{4,6}$/;

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_RE.test(pin);
}

function hash(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString("hex");
}

export async function hasWalletPin(userId: string): Promise<boolean> {
  return (await prisma.walletPin.count({ where: { userId } })) > 0;
}

/** Set or replace the PIN. Resets the lockout/attempt counter. */
export async function setWalletPin(userId: string, pin: string): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  const pinHash = hash(pin, salt);
  await prisma.walletPin.upsert({
    where: { userId },
    create: { userId, pinHash, salt, attempts: 0, lockedUntil: null },
    update: { pinHash, salt, attempts: 0, lockedUntil: null },
  });
}

export type PinVerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_pin" | "locked" | "mismatch"; retriesLeft?: number };

/**
 * Verify a PIN, updating the lockout state. Timing-safe compare. On success the
 * attempt counter resets; on the MAX_PIN_ATTEMPTS-th failure the PIN locks for
 * LOCKOUT_MS.
 */
export async function verifyWalletPin(userId: string, pin: string): Promise<PinVerifyResult> {
  const record = await prisma.walletPin.findUnique({ where: { userId } });
  if (!record) return { ok: false, reason: "no_pin" };
  if (record.lockedUntil && record.lockedUntil > new Date()) {
    return { ok: false, reason: "locked" };
  }

  const expected = Buffer.from(record.pinHash, "hex");
  const actual = Buffer.from(hash(pin, record.salt), "hex");
  const match = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (match) {
    if (record.attempts !== 0 || record.lockedUntil) {
      await prisma.walletPin.update({
        where: { userId },
        data: { attempts: 0, lockedUntil: null },
      });
    }
    return { ok: true };
  }

  const attempts = record.attempts + 1;
  const locked = attempts >= MAX_PIN_ATTEMPTS;
  await prisma.walletPin.update({
    where: { userId },
    data: {
      attempts: locked ? 0 : attempts, // reset the counter once the lock is set
      lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : null,
    },
  });
  return {
    ok: false,
    reason: locked ? "locked" : "mismatch",
    retriesLeft: locked ? 0 : MAX_PIN_ATTEMPTS - attempts,
  };
}

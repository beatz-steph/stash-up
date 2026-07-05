import { describe, it, expect, vi, beforeEach } from "vitest";
import { scryptSync } from "node:crypto";
import {
  isValidPinFormat,
  hasWalletPin,
  setWalletPin,
  verifyWalletPin,
  MAX_PIN_ATTEMPTS,
} from "./pin";
import { prisma } from "@workspace/db";

vi.mock("@workspace/db", () => ({
  prisma: {
    walletPin: {
      count: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const SALT = "0123456789abcdef";
function hashOf(pin: string): string {
  return scryptSync(pin, SALT, 64).toString("hex");
}
function record(pin: string, over: Record<string, unknown> = {}) {
  return { userId: "u1", pinHash: hashOf(pin), salt: SALT, attempts: 0, lockedUntil: null, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isValidPinFormat", () => {
  it("accepts 4–6 digit strings", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("123456")).toBe(true);
  });
  it("rejects too short / too long / non-digit / non-string", () => {
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12a4")).toBe(false);
    expect(isValidPinFormat(1234)).toBe(false);
    expect(isValidPinFormat(undefined)).toBe(false);
  });
});

describe("hasWalletPin", () => {
  it("is true when a row exists", async () => {
    vi.mocked(prisma.walletPin.count).mockResolvedValue(1);
    expect(await hasWalletPin("u1")).toBe(true);
  });
  it("is false when none", async () => {
    vi.mocked(prisma.walletPin.count).mockResolvedValue(0);
    expect(await hasWalletPin("u1")).toBe(false);
  });
});

describe("setWalletPin", () => {
  it("stores only a hash (never the plaintext) and resets the lock", async () => {
    vi.mocked(prisma.walletPin.upsert).mockResolvedValue({} as never);
    await setWalletPin("u1", "4321");
    const arg = vi.mocked(prisma.walletPin.upsert).mock.calls[0]![0] as {
      create: { pinHash: string; salt: string; attempts: number };
    };
    expect(arg.create.pinHash).not.toContain("4321");
    expect(arg.create.salt).toBeTruthy();
    expect(arg.create.attempts).toBe(0);
  });
});

describe("verifyWalletPin", () => {
  it("returns no_pin when the user has no PIN", async () => {
    vi.mocked(prisma.walletPin.findUnique).mockResolvedValue(null);
    expect(await verifyWalletPin("u1", "1234")).toEqual({ ok: false, reason: "no_pin" });
  });

  it("returns locked while the lockout window is active", async () => {
    vi.mocked(prisma.walletPin.findUnique).mockResolvedValue(
      record("1234", { lockedUntil: new Date(Date.now() + 60_000) }) as never
    );
    expect(await verifyWalletPin("u1", "1234")).toEqual({ ok: false, reason: "locked" });
    expect(prisma.walletPin.update).not.toHaveBeenCalled();
  });

  it("succeeds on a correct PIN and resets a non-zero attempt counter", async () => {
    vi.mocked(prisma.walletPin.findUnique).mockResolvedValue(
      record("1234", { attempts: 3 }) as never
    );
    vi.mocked(prisma.walletPin.update).mockResolvedValue({} as never);
    expect(await verifyWalletPin("u1", "1234")).toEqual({ ok: true });
    expect(prisma.walletPin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: 0, lockedUntil: null } })
    );
  });

  it("does not write on a correct PIN when the counter is already clean", async () => {
    vi.mocked(prisma.walletPin.findUnique).mockResolvedValue(record("1234") as never);
    expect(await verifyWalletPin("u1", "1234")).toEqual({ ok: true });
    expect(prisma.walletPin.update).not.toHaveBeenCalled();
  });

  it("returns mismatch with retriesLeft on a wrong PIN", async () => {
    vi.mocked(prisma.walletPin.findUnique).mockResolvedValue(record("1234") as never);
    vi.mocked(prisma.walletPin.update).mockResolvedValue({} as never);
    const res = await verifyWalletPin("u1", "9999");
    expect(res).toEqual({ ok: false, reason: "mismatch", retriesLeft: MAX_PIN_ATTEMPTS - 1 });
    expect(prisma.walletPin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: 1, lockedUntil: null } })
    );
  });

  it("locks on the MAX_PIN_ATTEMPTS-th consecutive failure", async () => {
    vi.mocked(prisma.walletPin.findUnique).mockResolvedValue(
      record("1234", { attempts: MAX_PIN_ATTEMPTS - 1 }) as never
    );
    vi.mocked(prisma.walletPin.update).mockResolvedValue({} as never);
    const res = await verifyWalletPin("u1", "9999");
    expect(res).toEqual({ ok: false, reason: "locked", retriesLeft: 0 });
    const arg = vi.mocked(prisma.walletPin.update).mock.calls[0]![0] as {
      data: { attempts: number; lockedUntil: Date | null };
    };
    expect(arg.data.attempts).toBe(0); // counter reset once the lock is set
    expect(arg.data.lockedUntil).toBeInstanceOf(Date);
  });
});

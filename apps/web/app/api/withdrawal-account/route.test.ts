import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"
import { prisma } from "@workspace/db"
import { getSession } from "@/lib/session"
import { createMockSession } from "@test/mocks/auth"
import { hashOtpCode } from "@/lib/withdrawal-otp"

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }))
vi.mock("@/lib/analytics/server", () => ({ captureServer: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))
vi.mock("@workspace/db", () => ({
  prisma: {
    withdrawalAccount: { findUnique: vi.fn(), upsert: vi.fn() },
    withdrawalAccountOtp: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))

const body = {
  bankCode: "058",
  bankName: "GTBank",
  accountNumber: "0123456789",
  accountName: "Jane Doe",
}

function req(payload: Record<string, unknown>) {
  return new Request("http://localhost/api/withdrawal-account", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/withdrawal-account (OTP gate on change)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }))
    vi.mocked(prisma.withdrawalAccount.upsert).mockResolvedValue(body as never)
  })

  it("first-time link (no existing account) requires no OTP", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue(null)

    const res = await POST(req(body))

    expect(res.status).toBe(200)
    expect(prisma.withdrawalAccount.upsert).toHaveBeenCalled()
    expect(prisma.withdrawalAccountOtp.findUnique).not.toHaveBeenCalled()
  })

  it("changing an existing account without an OTP is rejected", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never)

    const res = await POST(req(body)) // no otp

    expect(res.status).toBe(400)
    expect(prisma.withdrawalAccount.upsert).not.toHaveBeenCalled()
  })

  it("rejects a wrong OTP and increments attempts", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never)
    vi.mocked(prisma.withdrawalAccountOtp.findUnique).mockResolvedValue({
      codeHash: hashOtpCode("111111"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    } as never)

    const res = await POST(req({ ...body, otp: "999999" }))

    expect(res.status).toBe(400)
    expect(prisma.withdrawalAccountOtp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    )
    expect(prisma.withdrawalAccount.upsert).not.toHaveBeenCalled()
  })

  it("rejects an expired OTP", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never)
    vi.mocked(prisma.withdrawalAccountOtp.findUnique).mockResolvedValue({
      codeHash: hashOtpCode("123456"),
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
    } as never)

    const res = await POST(req({ ...body, otp: "123456" }))

    expect(res.status).toBe(400)
    expect(prisma.withdrawalAccount.upsert).not.toHaveBeenCalled()
  })

  it("accepts a correct OTP, burns it, and saves", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never)
    vi.mocked(prisma.withdrawalAccountOtp.findUnique).mockResolvedValue({
      codeHash: hashOtpCode("123456"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    } as never)

    const res = await POST(req({ ...body, otp: "123456" }))

    expect(res.status).toBe(200)
    expect(prisma.withdrawalAccountOtp.delete).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    })
    expect(prisma.withdrawalAccount.upsert).toHaveBeenCalled()
  })
})

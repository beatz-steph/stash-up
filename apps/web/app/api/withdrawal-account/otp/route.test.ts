import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"
import { prisma } from "@workspace/db"
import { getSession } from "@/lib/session"
import { createMockSession } from "@test/mocks/auth"
import { sendEmail } from "@/lib/email/send"

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }))
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }))
vi.mock("@workspace/db", () => ({
  prisma: {
    withdrawalAccount: { findUnique: vi.fn() },
    withdrawalAccountOtp: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

describe("POST /api/withdrawal-account/otp", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }))
    vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: "m1" })
  })

  it("401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it("400 when there is no existing account to change", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("429 when a code was requested within the cooldown window", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never)
    vi.mocked(prisma.withdrawalAccountOtp.findUnique).mockResolvedValue({
      createdAt: new Date(), // just now
    } as never)

    const res = await POST()
    expect(res.status).toBe(429)
    expect(prisma.withdrawalAccountOtp.upsert).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("issues + emails a code when eligible (stores only the hash)", async () => {
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never)
    vi.mocked(prisma.withdrawalAccountOtp.findUnique).mockResolvedValue(null)

    const res = await POST()

    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const upsertArg = vi.mocked(prisma.withdrawalAccountOtp.upsert).mock.calls[0]![0]
    // Never persist the raw code — only a 64-char sha256 hex hash.
    expect(upsertArg.create.codeHash).toMatch(/^[a-f0-9]{64}$/)
  })
})

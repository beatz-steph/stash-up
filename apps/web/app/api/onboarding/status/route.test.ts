import { vi, describe, it, expect } from "vitest"
import { GET } from "./route"
import { getSession } from "@/lib/session"
import { prisma } from "@workspace/db"
import { createMockSession } from "@test/mocks/auth"

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));


describe("GET /api/onboarding/status", () => {
  it("returns 401 when unauthorized", async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    const response = await GET()
    expect(response.status).toBe(401)
  })

  it("returns 200 with status when authenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(
      createMockSession({ id: "user-1", emailVerified: true })
    )
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({
      id: "wa-1",
      userId: "user-1",
      bankCode: "058",
      bankName: "GTBank",
      accountNumber: "0000000000",
      accountName: "Test User",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const response = await GET()
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({
      account: true,
      verified: true,
      withdrawal: true,
    })
  })
})

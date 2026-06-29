import { vi, describe, it, expect } from "vitest"
import { GET } from "./route"
import { auth } from "@/lib/auth"
import { prisma } from "@workspace/db"
import { createMockSession } from "@test/mocks/auth"

type Session = Awaited<ReturnType<typeof auth.api.getSession>>

describe("GET /api/onboarding/status", () => {
  it("returns 401 when unauthorized", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const response = await GET()
    expect(response.status).toBe(401)
  })

  it("returns 200 with status when authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(
      createMockSession({ id: "user-1", emailVerified: true }) as Session
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
    expect(await response.json()).toEqual({
      account: true,
      verified: true,
      withdrawal: true,
    })
  })
})

import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireAdmin: vi.fn(),
}))

describe("GET /api/users/[id]", () => {
  it("should return user detail with masked withdrawal account number", async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      session: { user: { role: "SUPPORT" } } as never,
      error: null,
    })

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-1",
      name: "John Doe",
      email: "john@example.com",
      username: "johndoe",
      createdAt: new Date(),
      lifetimeDefaultCount: 0,
      blockedFromCircles: false,
      withdrawalAccount: {
        bankName: "Guaranty Trust Bank",
        accountName: "John Doe",
        accountNumber: "0123456789",
      },
      memberships: [],
    } as never)

    const req = new Request("http://localhost/api/users/user-1")
    const params = Promise.resolve({ id: "user-1" })
    const response = await GET(req, { params })
    
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.withdrawalAccount).toBeDefined()
    expect(data.withdrawalAccount.accountNumber).toBe("••••6789")
  })
})

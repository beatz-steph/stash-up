import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    circle: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireAdmin: vi.fn(),
}))

describe("GET /api/circles/[id]", () => {
  it("should return circle detail and mask virtual account", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      session: { user: { role: "SUPPORT" } } as never,
      error: null,
    })

    vi.mocked(prisma.circle.findUnique).mockResolvedValueOnce({
      id: "c1",
      name: "Circle 1",
      status: "ACTIVE",
      frequency: "MONTHLY",
      contributionMinor: 1000,
      totalSlots: 5,
      createdAt: new Date(),
      createdByUserId: "u1",
      memberships: [
        {
          id: "m1",
          userId: "u1",
          role: "MEMBER",
          status: "ACTIVE",
          payoutPosition: 1,
          user: { name: "User 1" },
          virtualAccount: {
            bankName: "Bank",
            bankAccountName: "User 1 VA",
            bankAccountNumber: "0123456789",
            status: "ACTIVE",
          },
        },
      ],
      cycles: [],
    } as never)

    const req = new Request("http://localhost/api/circles/c1")
    const params = Promise.resolve({ id: "c1" })
    const response = await GET(req, { params })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.members[0].virtualAccount.accountNumber).toBe("••••6789")
  })
})

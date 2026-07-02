import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireAdmin: vi.fn(),
}))

describe("GET /api/users", () => {
  it("should return paginated users", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      session: { user: { role: "SUPPORT" } } as never,
      error: null,
    })

    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: "u1", name: "User 1", email: "u1@e.com", username: "u1", createdAt: new Date(), lifetimeDefaultCount: 0, blockedFromCircles: false },
    ] as never)
    vi.mocked(prisma.user.count).mockResolvedValueOnce(1)

    const req = new Request("http://localhost/api/users?page=1&limit=50")
    const response = await GET(req)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.items.length).toBe(1)
    expect(data.total).toBe(1)
  })
})

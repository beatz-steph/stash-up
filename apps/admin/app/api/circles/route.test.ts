import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  CircleStatus: { ACTIVE: "ACTIVE", FORMING: "FORMING", COMPLETED: "COMPLETED", CANCELLED: "CANCELLED" },
  prisma: {
    circle: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireAdmin: vi.fn(),
}))

describe("GET /api/circles", () => {
  it("should return paginated circles", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      session: { user: { role: "SUPPORT" } } as never,
      error: null,
    })

    vi.mocked(prisma.circle.findMany).mockResolvedValueOnce([
      { id: "c1", name: "Circle 1", status: "ACTIVE", frequency: "MONTHLY", contributionMinor: 1000, totalSlots: 5, createdAt: new Date(), createdByUserId: "u1" },
    ] as never)
    vi.mocked(prisma.circle.count).mockResolvedValueOnce(1)

    const req = new Request("http://localhost/api/circles?page=1&limit=50")
    const response = await GET(req)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.items.length).toBe(1)
    expect(data.total).toBe(1)
  })
})

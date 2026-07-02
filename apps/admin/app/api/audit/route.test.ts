import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    adminAuditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireAdmin: vi.fn(),
}))

describe("GET /api/audit", () => {
  it("should return paginated audit logs", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      session: { user: { role: "SUPPORT" } } as never,
      error: null,
    })

    vi.mocked(prisma.adminAuditLog.findMany).mockResolvedValueOnce([
      { id: "a1", adminUserId: "au1", adminUser: { name: "Admin 1" }, action: "TEST", entityType: null, entityId: null, metadata: null, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.adminAuditLog.count).mockResolvedValueOnce(1)

    const req = new Request("http://localhost/api/audit?page=1&limit=50")
    const response = await GET(req)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.items.length).toBe(1)
    expect(data.total).toBe(1)
  })
})

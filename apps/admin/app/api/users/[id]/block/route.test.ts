import { describe, it, expect, vi } from "vitest"
import { POST } from "./route"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    adminAuditLog: {
      create: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireSuperAdmin: vi.fn(),
}))

describe("POST /api/users/[id]/block", () => {
  it("should return 403 for SUPPORT role", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: null as never,
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never,
    })

    const req = new Request("http://localhost/api/users/1/block", {
      method: "POST",
      body: JSON.stringify({ blocked: true })
    })
    const response = await POST(req, { params: Promise.resolve({ id: "1" }) })
    
    expect(response.status).toBe(403)
  })

  it("should block user and create audit log for SUPER_ADMIN", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: { user: { id: "admin-1", role: "SUPER_ADMIN" } } as never,
      error: null,
    })

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ blockedFromCircles: false } as never)
    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: "user-1", blockedFromCircles: true } as never)
    vi.mocked(prisma.adminAuditLog.create).mockResolvedValueOnce({} as never)

    const req = new Request("http://localhost/api/users/1/block", {
      method: "POST",
      body: JSON.stringify({ blocked: true })
    })
    const response = await POST(req, { params: Promise.resolve({ id: "user-1" }) })
    
    expect(response.status).toBe(200)
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: "admin-1",
          action: "USER_BLOCKED",
          entityId: "user-1",
          metadata: { from: { blockedFromCircles: false }, to: { blockedFromCircles: true } }
        })
      })
    )
  })
})

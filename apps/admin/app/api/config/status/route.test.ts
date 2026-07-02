import { describe, it, expect, vi } from "vitest"
import { POST } from "./route"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  ConfigStatus: { ACTIVE: "ACTIVE", INVALID: "INVALID" },
  prisma: {
    nombaConfig: {
      findFirst: vi.fn(),
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

describe("POST /api/config/status", () => {
  it("should return 403 for SUPPORT role", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: null as never,
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never,
    })

    const req = new Request("http://localhost/api/config/status", {
      method: "POST",
      body: JSON.stringify({ status: "INVALID" })
    })
    const response = await POST(req)
    
    expect(response.status).toBe(403)
  })

  it("should return 400 for invalid status enum", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: { user: { id: "admin-1", role: "SUPER_ADMIN" } } as never,
      error: null,
    })

    const req = new Request("http://localhost/api/config/status", {
      method: "POST",
      body: JSON.stringify({ status: "NOT_REAL" })
    })
    const response = await POST(req)
    
    expect(response.status).toBe(400)
  })

  it("should toggle config and create audit log", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: { user: { id: "admin-1", role: "SUPER_ADMIN" } } as never,
      error: null,
    })

    vi.mocked(prisma.nombaConfig.findFirst).mockResolvedValueOnce({ id: "config-1", status: "ACTIVE" } as never)
    vi.mocked(prisma.nombaConfig.update).mockResolvedValueOnce({ id: "config-1", status: "INVALID" } as never)
    vi.mocked(prisma.adminAuditLog.create).mockResolvedValueOnce({} as never)

    const req = new Request("http://localhost/api/config/status", {
      method: "POST",
      body: JSON.stringify({ status: "INVALID" })
    })
    const response = await POST(req)
    
    expect(response.status).toBe(200)
    expect(prisma.nombaConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "config-1" },
        data: { status: "INVALID" }
      })
    )
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: "admin-1",
          action: "NOMBA_CONFIG_TOGGLED",
          entityId: "config-1",
          metadata: { from: { status: "ACTIVE" }, to: { status: "INVALID" } }
        })
      })
    )

    const responseData = await response.json()
    expect(responseData.data).not.toHaveProperty("clientSecretCipher")
    expect(responseData.data).not.toHaveProperty("webhookSecretCipher")
  })
})

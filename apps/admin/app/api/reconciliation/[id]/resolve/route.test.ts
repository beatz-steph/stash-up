import { describe, it, expect, vi } from "vitest"
import { POST } from "./route"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    inboundTransfer: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    cycle: {
      findUnique: vi.fn(),
    },
    adminAuditLog: {
      create: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireSuperAdmin: vi.fn(),
}))

describe("POST /api/reconciliation/[id]/resolve", () => {
  it("should return 403 for SUPPORT role", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: null as never,
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never,
    })

    const req = new Request("http://localhost/api/reconciliation/1/resolve", {
      method: "POST",
      body: JSON.stringify({})
    })
    const response = await POST(req, { params: Promise.resolve({ id: "1" }) })
    
    expect(response.status).toBe(403)
  })

  it("should return 400 if matchedMembershipId provided without matchedCycleId", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: { user: { id: "admin-1", role: "SUPER_ADMIN" } } as never,
      error: null,
    })

    const req = new Request("http://localhost/api/reconciliation/1/resolve", {
      method: "POST",
      body: JSON.stringify({ matchedMembershipId: "mem-1" }) // missing matchedCycleId
    })
    const response = await POST(req, { params: Promise.resolve({ id: "transfer-1" }) })
    
    expect(response.status).toBe(400)
  })

  it("should return 400 if membership does not belong to circle", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: { user: { id: "admin-1", role: "SUPER_ADMIN" } } as never,
      error: null,
    })

    vi.mocked(prisma.inboundTransfer.findUnique).mockResolvedValueOnce({ matchStatus: "UNMATCHED" } as never)
    vi.mocked(prisma.cycle.findUnique).mockResolvedValueOnce({ 
      circle: { memberships: [{ id: "mem-other" }] } 
    } as never)

    const req = new Request("http://localhost/api/reconciliation/1/resolve", {
      method: "POST",
      body: JSON.stringify({ matchedCycleId: "cycle-1", matchedMembershipId: "mem-1" })
    })
    const response = await POST(req, { params: Promise.resolve({ id: "transfer-1" }) })
    
    expect(response.status).toBe(400)
  })

  it("should resolve transfer to MANUAL and create audit log", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: { user: { id: "admin-1", role: "SUPER_ADMIN" } } as never,
      error: null,
    })

    vi.mocked(prisma.inboundTransfer.findUnique).mockResolvedValueOnce({ matchStatus: "UNMATCHED" } as never)
    vi.mocked(prisma.cycle.findUnique).mockResolvedValueOnce({ 
      circle: { memberships: [{ id: "mem-1" }] } 
    } as never)
    vi.mocked(prisma.inboundTransfer.update).mockResolvedValueOnce({} as never)

    const req = new Request("http://localhost/api/reconciliation/1/resolve", {
      method: "POST",
      body: JSON.stringify({ matchedCycleId: "cycle-1", matchedMembershipId: "mem-1" })
    })
    const response = await POST(req, { params: Promise.resolve({ id: "transfer-1" }) })
    
    expect(response.status).toBe(200)
    expect(prisma.inboundTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchStatus: "MANUAL" })
      })
    )
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: "admin-1",
          action: "TRANSFER_RESOLVED",
          entityId: "transfer-1",
        })
      })
    )
  })
})

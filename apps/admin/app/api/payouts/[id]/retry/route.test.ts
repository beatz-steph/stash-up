import { describe, it, expect, vi } from "vitest"
import { POST } from "./route"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    payout: {
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

describe("POST /api/payouts/[id]/retry", () => {
  it("should return 403 for SUPPORT role", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: null as never,
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never,
    })

    const req = new Request("http://localhost/api/payouts/1/retry", {
      method: "POST",
    })
    const response = await POST(req, { params: Promise.resolve({ id: "1" }) })
    
    expect(response.status).toBe(403)
  })

  it("should record intent and return 200 without creating a Payout", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: { user: { id: "admin-1", role: "SUPER_ADMIN" } } as never,
      error: null,
    })

    vi.mocked(prisma.payout.findUnique).mockResolvedValueOnce({ id: "payout-1", cycleId: "cycle-1" } as never)
    vi.mocked(prisma.adminAuditLog.create).mockResolvedValueOnce({} as never)

    const req = new Request("http://localhost/api/payouts/1/retry", {
      method: "POST",
    })
    const response = await POST(req, { params: Promise.resolve({ id: "payout-1" }) })
    
    expect(response.status).toBe(200)
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: "admin-1",
          action: "PAYOUT_RETRY_REQUESTED",
          entityId: "payout-1",
          metadata: expect.objectContaining({ cycleId: "cycle-1" })
        })
      })
    )
  })
})

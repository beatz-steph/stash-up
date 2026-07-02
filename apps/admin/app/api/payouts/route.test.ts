import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  PayoutStatus: { INITIATED: "INITIATED", PENDING_BILLING: "PENDING_BILLING", SUCCESS: "SUCCESS", FAILED: "FAILED", REFUNDED: "REFUNDED" },
  prisma: {
    payout: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireAdmin: vi.fn(),
}))

describe("GET /api/payouts", () => {
  it("should return paginated payouts", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      session: { user: { role: "SUPPORT" } } as never,
      error: null,
    })

    vi.mocked(prisma.payout.findMany).mockResolvedValueOnce([
      { id: "p1", cycleId: "cy1", amountMinor: 1000, nombaTransferId: null, nombaStatus: null, recipientBankName: "Bank", recipientAccountName: "Name", status: "INITIATED", failureReason: null, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.payout.count).mockResolvedValueOnce(1)

    const req = new Request("http://localhost/api/payouts?page=1&limit=50")
    const response = await GET(req)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.items.length).toBe(1)
    expect(data.total).toBe(1)
  })
})

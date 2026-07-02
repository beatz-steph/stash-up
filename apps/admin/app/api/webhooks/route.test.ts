import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    webhookReceipt: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireAdmin: vi.fn(),
}))

describe("GET /api/webhooks", () => {
  it("should return paginated webhooks", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      session: { user: { role: "SUPPORT" } } as never,
      error: null,
    })

    vi.mocked(prisma.webhookReceipt.findMany).mockResolvedValueOnce([
      { id: "w1", providerEventId: "ev1", eventType: "payment_success", signatureValid: true, processed: true, processingError: null, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.webhookReceipt.count).mockResolvedValueOnce(1)

    const req = new Request("http://localhost/api/webhooks?page=1&limit=50")
    const response = await GET(req)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.items.length).toBe(1)
    expect(data.total).toBe(1)
  })
})

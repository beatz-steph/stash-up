import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    inboundTransfer: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireAdmin: vi.fn(),
}))

describe("GET /api/reconciliation", () => {
  it("should return reconciliation queue with masked sender account number", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      session: { user: { role: "SUPPORT" } } as never,
      error: null,
    })

    vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValueOnce([
      {
        id: "transfer-1",
        provider: "NOMBA",
        nombaTransactionId: "txn_123",
        amountMinor: 100000,
        currency: "NGN",
        senderName: "Jane Doe",
        senderBank: "First Bank",
        senderAccountNumber: "9876543210",
        narration: "Monthly contribution",
        matchStatus: "UNMATCHED",
        receivedAt: new Date(),
      },
    ] as never)

    vi.mocked(prisma.inboundTransfer.count).mockResolvedValueOnce(1)

    const req = new Request("http://localhost/api/reconciliation?page=1&limit=10")
    const response = await GET(req)
    
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.items.length).toBe(1)
    expect(data.items[0].senderName).toBe("Jane Doe") // Not masked
    expect(data.items[0].senderAccountNumber).toBe("••••3210") // Masked
  })
})

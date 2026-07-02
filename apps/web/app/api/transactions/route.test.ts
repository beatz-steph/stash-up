import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { getSession } from "@/lib/session"
import { createMockSession } from "@test/mocks/auth"

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }))
vi.mock("@workspace/db", () => ({
  prisma: {
    inboundTransfer: { findMany: vi.fn() },
    payout: { findMany: vi.fn() },
  },
}))

function req(url = "http://localhost/api/transactions") {
  return new Request(url)
}

describe("GET /api/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }))
  })

  it("401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it("merges contributions + payouts, newest first, with correct shape", async () => {
    vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([
      {
        id: "t1",
        amountMinor: 500000,
        matchStatus: "MATCHED",
        receivedAt: new Date("2026-06-01T10:00:00Z"),
        matchedCycle: { sequence: 1 },
        virtualAccount: { membership: { circle: { id: "c1", name: "Alpha" } } },
      },
    ] as never)
    vi.mocked(prisma.payout.findMany).mockResolvedValue([
      {
        id: "p1",
        amountMinor: 1000000,
        status: "SUCCESS",
        createdAt: new Date("2026-06-10T10:00:00Z"),
        cycle: { sequence: 2, circle: { id: "c1", name: "Alpha" } },
      },
    ] as never)

    const res = await GET(req())
    expect(res.status).toBe(200)
    const { data } = await res.json()

    // Payout (Jun 10) is newer than the contribution (Jun 1) → comes first.
    expect(data.items).toHaveLength(2)
    expect(data.items[0]).toMatchObject({ kind: "PAYOUT", amountMinor: 1000000, circleName: "Alpha" })
    expect(data.items[1]).toMatchObject({ kind: "CONTRIBUTION", amountMinor: 500000, cycleSequence: 1 })
  })

  it("scopes both queries to the current user", async () => {
    vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.payout.findMany).mockResolvedValue([] as never)

    await GET(req())

    expect(prisma.inboundTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { virtualAccount: { membership: { userId: "user-1" } } },
      }),
    )
    expect(prisma.payout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientMembership: { userId: "user-1" } } }),
    )
  })
})

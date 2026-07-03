import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { getSession } from "@/lib/session"
import { createMockSession } from "@test/mocks/auth"
import { decodeCursor } from "@/lib/api/cursor"

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }))
vi.mock("@workspace/db", () => ({
  prisma: {
    inboundTransfer: { findMany: vi.fn() },
    payout: { findMany: vi.fn() },
  },
  Prisma: {},
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

  describe("cursor pagination", () => {
    // 5 payouts (p5 newest .. p1 oldest), no inbound rows — simplest way to
    // exercise the merge/slice/nextCursor logic against a single source.
    const payoutRows = Array.from({ length: 5 }, (_, i) => {
      const n = 5 - i // p5, p4, p3, p2, p1
      return {
        id: `p${n}`,
        amountMinor: n * 1000,
        status: "SUCCESS",
        createdAt: new Date(`2026-06-0${n}T10:00:00Z`),
        cycle: { sequence: n, circle: { id: "c1", name: "Alpha" } },
      }
    })

    it("page 1 returns nextCursor when more rows remain", async () => {
      vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([] as never)
      // limit=2 -> route asks for 3 (limit+1); mock returns the first 3 desc rows.
      vi.mocked(prisma.payout.findMany).mockResolvedValue(payoutRows.slice(0, 3) as never)

      const res = await GET(req("http://localhost/api/transactions?limit=2"))
      const { data } = await res.json()

      expect(data.items).toHaveLength(2)
      expect(data.items.map((i: { id: string }) => i.id)).toEqual(["out_p5", "out_p4"])
      expect(data.nextCursor).not.toBeNull()

      const decoded = decodeCursor(data.nextCursor)
      expect(decoded).toEqual({ createdAt: "2026-06-04T10:00:00.000Z", id: "p4" })
    })

    it("page 2 (using page 1's cursor) excludes page-1 items and applies the cursor filter to both sources", async () => {
      vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([] as never)
      // Simulate what the DB would actually return once the cursor filter is applied.
      vi.mocked(prisma.payout.findMany).mockResolvedValue(payoutRows.slice(2, 5) as never)

      const { encodeCursor } = await import("@/lib/api/cursor")
      const cursor = encodeCursor({ createdAt: "2026-06-04T10:00:00.000Z", id: "p4" })

      const res = await GET(req(`http://localhost/api/transactions?limit=2&cursor=${cursor}`))
      const { data } = await res.json()

      expect(data.items).toHaveLength(2)
      expect(data.items.map((i: { id: string }) => i.id)).toEqual(["out_p3", "out_p2"])
      // No overlap with page 1's ["out_p5", "out_p4"].
      expect(data.items.some((i: { id: string }) => i.id === "out_p5" || i.id === "out_p4")).toBe(
        false,
      )
      expect(data.nextCursor).not.toBeNull()

      // The cursor filter must have reached both underlying queries (both
      // sources feed the same merged feed, so both must be bounded).
      expect(prisma.payout.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipientMembership: { userId: "user-1" },
            OR: [
              { createdAt: { lt: new Date("2026-06-04T10:00:00.000Z") } },
              { createdAt: new Date("2026-06-04T10:00:00.000Z"), id: { lt: "p4" } },
            ],
          }),
        }),
      )
      expect(prisma.inboundTransfer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            virtualAccount: { membership: { userId: "user-1" } },
            OR: [
              { receivedAt: { lt: new Date("2026-06-04T10:00:00.000Z") } },
              { receivedAt: new Date("2026-06-04T10:00:00.000Z"), id: { lt: "p4" } },
            ],
          }),
        }),
      )
    })

    it("last page has no nextCursor when both sources are exhausted", async () => {
      vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.payout.findMany).mockResolvedValue(payoutRows.slice(4, 5) as never)

      const res = await GET(req("http://localhost/api/transactions?limit=2"))
      const { data } = await res.json()

      expect(data.items).toHaveLength(1)
      expect(data.nextCursor).toBeNull()
    })
  })
})

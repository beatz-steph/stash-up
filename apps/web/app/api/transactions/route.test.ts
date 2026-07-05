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
    walletLedgerEntry: { findMany: vi.fn() },
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
    // Default: no wallet movements — tests that exercise them opt in.
    vi.mocked(prisma.walletLedgerEntry.findMany).mockResolvedValue([] as never)
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

  it("scopes all three queries to the current user", async () => {
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
    expect(prisma.walletLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { wallet: { userId: "user-1" } } }),
    )
  })

  it("merges wallet movements with direction + label and correct sign", async () => {
    vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.payout.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.walletLedgerEntry.findMany).mockResolvedValue([
      {
        id: "w1",
        direction: "CREDIT",
        amountMinor: 500000,
        source: "TOPUP_CARD",
        createdAt: new Date("2026-06-20T10:00:00Z"),
      },
      {
        id: "w2",
        direction: "DEBIT",
        amountMinor: 200000,
        source: "WITHDRAWAL",
        createdAt: new Date("2026-06-19T10:00:00Z"),
      },
    ] as never)

    const res = await GET(req())
    const { data } = await res.json()

    expect(data.items).toHaveLength(2)
    expect(data.items[0]).toMatchObject({
      id: "wal_w1",
      kind: "WALLET",
      direction: "CREDIT",
      label: "Card top-up",
      amountMinor: 500000,
      circleId: "",
    })
    expect(data.items[1]).toMatchObject({
      id: "wal_w2",
      kind: "WALLET",
      direction: "DEBIT",
      label: "Withdrawal",
    })
  })

  it("wallet outranks payout at a tied timestamp and pages without skips", async () => {
    const tie = new Date("2026-06-15T10:00:00Z")
    const payoutTie = {
      id: "p1",
      amountMinor: 1000,
      status: "SUCCESS",
      createdAt: tie,
      cycle: { sequence: 1, circle: { id: "c1", name: "Alpha" } },
    }
    const walletTie = {
      id: "w1",
      direction: "CREDIT",
      amountMinor: 2000,
      source: "TOPUP_BANK",
      createdAt: tie,
    }

    // Page 1: "wal_w1" > "out_p1" lexically → wallet comes first.
    vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.payout.findMany).mockResolvedValueOnce([payoutTie] as never)
    vi.mocked(prisma.walletLedgerEntry.findMany).mockResolvedValueOnce([walletTie] as never)

    const page1 = (await GET(req("http://localhost/api/transactions?limit=1")).then((r) => r.json())).data
    expect(page1.items[0].id).toBe("wal_w1")
    expect(page1.nextCursor).not.toBeNull()

    // Page 2 resuming from the wallet cursor: the payout at the tie is still
    // eligible (lower rank, not yet emitted); the wallet row is excluded.
    vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.payout.findMany).mockResolvedValueOnce([payoutTie] as never)
    vi.mocked(prisma.walletLedgerEntry.findMany).mockResolvedValueOnce([] as never)

    const page2 = (
      await GET(
        req(`http://localhost/api/transactions?limit=1&cursor=${page1.nextCursor}`),
      ).then((r) => r.json())
    ).data
    expect(page2.items[0].id).toBe("out_p1")

    // Payout query got the whole tie (no id restriction) because the cursor is
    // a wallet row; the wallet query got `id < w1` at the tie.
    expect(prisma.payout.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { createdAt: { lt: tie } },
            { createdAt: tie },
          ],
        }),
      }),
    )
    expect(prisma.walletLedgerEntry.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { createdAt: { lt: tie } },
            { createdAt: tie, id: { lt: "w1" } },
          ],
        }),
      }),
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

      // Cursor id keeps the "out_"/"in_" prefix — InboundTransfer and Payout
      // ids are independent cuid sequences, so a raw id from one table means
      // nothing against the other table's id column. The prefix is what lets
      // the per-source filters resolve an equal-timestamp tie correctly.
      const decoded = decodeCursor(data.nextCursor)
      expect(decoded).toEqual({ createdAt: "2026-06-04T10:00:00.000Z", id: "out_p4" })
    })

    it("page 2 (using page 1's cursor) excludes page-1 items and applies the cursor filter to both sources", async () => {
      vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([] as never)
      // Simulate what the DB would actually return once the cursor filter is applied.
      vi.mocked(prisma.payout.findMany).mockResolvedValue(payoutRows.slice(2, 5) as never)

      const { encodeCursor } = await import("@/lib/api/cursor")
      const cursor = encodeCursor({ createdAt: "2026-06-04T10:00:00.000Z", id: "out_p4" })

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
      // sources feed the same merged feed, so both must be bounded). Cursor
      // belongs to the payout source, so: payouts get `id < p4` (raw), and
      // inbound gets the tie timestamp with NO id restriction (every
      // contribution at that instant is still eligible — none were emitted
      // on page 1, since payouts always sort first at a tie).
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
              { receivedAt: new Date("2026-06-04T10:00:00.000Z") },
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

    it("equal-timestamp rows across BOTH sources page correctly (cross-source tie, no dup/skip)", async () => {
      // Payout p1 and contribution t1 share the exact same instant. In the
      // merge, "out_p1" sorts before "in_t1" (prefix compare, "out_" > "in_"
      // lexically). Page 1 (limit=1) should return only the payout; page 2
      // (resuming from that cursor) must return the contribution — not skip
      // it (a raw-id cross-table compare would have silently dropped it).
      const tieTimestamp = new Date("2026-06-15T10:00:00Z")
      const payoutTie = {
        id: "p1",
        amountMinor: 1000,
        status: "SUCCESS",
        createdAt: tieTimestamp,
        cycle: { sequence: 1, circle: { id: "c1", name: "Alpha" } },
      }
      const inboundTie = {
        id: "t1",
        amountMinor: 2000,
        matchStatus: "MATCHED",
        receivedAt: tieTimestamp,
        matchedCycle: { sequence: 1 },
        virtualAccount: { membership: { circle: { id: "c1", name: "Alpha" } } },
      }

      // Page 1: both sources return their one row (limit+1 = 2 requested).
      vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValueOnce([inboundTie] as never)
      vi.mocked(prisma.payout.findMany).mockResolvedValueOnce([payoutTie] as never)

      const page1Res = await GET(req("http://localhost/api/transactions?limit=1"))
      const page1 = (await page1Res.json()).data

      expect(page1.items).toHaveLength(1)
      expect(page1.items[0].id).toBe("out_p1")
      expect(page1.nextCursor).not.toBeNull()

      // Page 2: DB now excludes the already-returned payout (cursor filter
      // applied), contribution is still there (tie, not yet emitted).
      vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValueOnce([inboundTie] as never)
      vi.mocked(prisma.payout.findMany).mockResolvedValueOnce([] as never)

      const page2Res = await GET(
        req(`http://localhost/api/transactions?limit=1&cursor=${page1.nextCursor}`),
      )
      const page2 = (await page2Res.json()).data

      expect(page2.items).toHaveLength(1)
      expect(page2.items[0].id).toBe("in_t1")
      expect(page2.nextCursor).toBeNull()
    })
  })
})

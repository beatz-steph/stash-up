import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"
import { validateRequestBody } from "@/lib/api/validate"
import { recordAudit } from "@/lib/audit"

// tx mock shared across a single $transaction call
const tx = {
  orphanTransaction: { findUnique: vi.fn(), update: vi.fn() },
  inboundTransfer: { create: vi.fn() },
  contribution: { upsert: vi.fn() },
  membership: { update: vi.fn() },
  cycle: { update: vi.fn() },
}

vi.mock("@workspace/db", () => ({
  prisma: {
    orphanTransaction: { findUnique: vi.fn() },
    circle: { findUnique: vi.fn() },
    cycle: { findUnique: vi.fn() },
    contribution: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  },
  Prisma: {},
}))
vi.mock("@/lib/access-control", () => ({ requireSuperAdmin: vi.fn() }))
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }))
vi.mock("@/lib/api/validate", () => ({ validateRequestBody: vi.fn() }))

function reqFor(id = "orph-1") {
  return new Request(`http://localhost/api/reconciliation/orphans/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({}),
  })
}
const params = (id = "orph-1") => ({ params: Promise.resolve({ id }) })

const VA = {
  id: "va-1",
  accountRef: "membership_mem-1",
  membershipId: "mem-1",
  membership: { id: "mem-1", circleId: "circle-1", userId: "user-1" },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireSuperAdmin).mockResolvedValue({
    session: { user: { id: "admin-1", role: "SUPER_ADMIN" } } as never,
    error: null,
  })
  vi.mocked(validateRequestBody).mockResolvedValue({ success: true, data: {} } as never)
  vi.mocked(recordAudit).mockResolvedValue(undefined as never)
  tx.orphanTransaction.findUnique.mockResolvedValue({ status: "PENDING" })
  tx.inboundTransfer.create.mockResolvedValue({ id: "ib-1" })
  tx.orphanTransaction.update.mockResolvedValue({})
  tx.contribution.upsert.mockResolvedValue({})
  tx.membership.update.mockResolvedValue({})
})

describe("POST /api/reconciliation/orphans/[id]/resolve", () => {
  it("403 for SUPPORT role", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      session: null as never,
      error: new Response(null, { status: 403 }) as never,
    })
    const res = await POST(reqFor(), params())
    expect(res.status).toBe(403)
  })

  it("404 when the orphan doesn't exist", async () => {
    vi.mocked(prisma.orphanTransaction.findUnique).mockResolvedValue(null as never)
    const res = await POST(reqFor(), params())
    expect(res.status).toBe(404)
  })

  it("409 when the orphan is not pending", async () => {
    vi.mocked(prisma.orphanTransaction.findUnique).mockResolvedValue({
      status: "RESOLVED",
      virtualAccount: VA,
    } as never)
    const res = await POST(reqFor(), params())
    expect(res.status).toBe(409)
  })

  it("owes full amount → increments pot, contribution COMPLETE", async () => {
    vi.mocked(prisma.orphanTransaction.findUnique).mockResolvedValue({
      id: "orph-1",
      status: "PENDING",
      nombaTransactionId: "ntx-1",
      amountMinor: 10000,
      currency: "NGN",
      transactionAt: new Date(),
      senderName: null,
      narration: null,
      virtualAccount: VA,
    } as never)
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "circle-1",
      status: "ACTIVE",
      contributionMinor: 10000,
      currentCycleSeq: 1,
    } as never)
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      id: "cycle-1",
      sequence: 1,
      status: "OPEN",
    } as never)
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue(null as never)
    tx.cycle.update.mockResolvedValue({
      id: "cycle-1",
      potCollectedMinor: 10000,
      potExpectedMinor: 20000,
      status: "OPEN",
    })

    const res = await POST(reqFor(), params())
    const { data } = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({ status: "RESOLVED", appliedToPot: 10000, appliedToBuffer: 0 })
    expect(tx.contribution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ amountMinor: 10000, status: "COMPLETE" }),
      })
    )
    expect(tx.membership.update).not.toHaveBeenCalled()
    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchStatus: "MANUAL", providerEventId: "orphan_orph-1" }),
      })
    )
  })

  it("already paid up → whole amount goes to buffer", async () => {
    vi.mocked(prisma.orphanTransaction.findUnique).mockResolvedValue({
      id: "orph-1",
      status: "PENDING",
      nombaTransactionId: "ntx-1",
      amountMinor: 5000,
      currency: "NGN",
      transactionAt: new Date(),
      senderName: null,
      narration: null,
      virtualAccount: VA,
    } as never)
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "circle-1",
      status: "ACTIVE",
      contributionMinor: 10000,
      currentCycleSeq: 1,
    } as never)
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
      id: "cycle-1",
      sequence: 1,
      status: "COLLECTING",
    } as never)
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue({
      id: "con-1",
      amountMinor: 10000,
      status: "COMPLETE",
    } as never)

    const res = await POST(reqFor(), params())
    const { data } = await res.json()

    expect(data).toMatchObject({ appliedToPot: 0, appliedToBuffer: 5000 })
    expect(tx.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bufferMinor: { increment: 5000 } } })
    )
    expect(tx.cycle.update).not.toHaveBeenCalled()
  })

  it("no eligible cycle → whole amount goes to buffer", async () => {
    vi.mocked(prisma.orphanTransaction.findUnique).mockResolvedValue({
      id: "orph-1",
      status: "PENDING",
      nombaTransactionId: "ntx-1",
      amountMinor: 7000,
      currency: "NGN",
      transactionAt: new Date(),
      senderName: null,
      narration: null,
      virtualAccount: VA,
    } as never)
    // Circle not ACTIVE → matcher returns UNMATCHED → not eligible.
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "circle-1",
      status: "FORMING",
      contributionMinor: 10000,
      currentCycleSeq: 1,
    } as never)
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.contribution.findUnique).mockResolvedValue(null as never)

    const res = await POST(reqFor(), params())
    const { data } = await res.json()

    expect(data).toMatchObject({ appliedToPot: 0, appliedToBuffer: 7000 })
    expect(tx.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bufferMinor: { increment: 7000 } } })
    )
    expect(tx.contribution.upsert).not.toHaveBeenCalled()
    expect(tx.inboundTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchedCycleId: null }) })
    )
  })
})

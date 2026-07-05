import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { POST } from "./route"
import { requireAdmin } from "@/lib/access-control"
import { recordAudit } from "@/lib/audit"

vi.mock("@/lib/access-control", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }))

const report = {
  status: "ok",
  ledger: {
    inboundTotalMinor: 1_000_000,
    payoutSettledOutMinor: 600_000,
    withdrawalSettledOutMinor: 0,
    expectedBalanceMinor: 400_000,
    outstandingOutboundMinor: 0,
  },
  nomba: { ledgerBalanceMinor: 400_000, driftMinor: 0, error: null },
  attention: { stuckPayouts: 0, stuckWithdrawals: 0, unmatchedInbound: 0, items: [] },
  checkedAt: "2026-07-05T00:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = "secret"
  vi.mocked(requireAdmin).mockResolvedValue({
    session: { user: { id: "admin-1" } } as never,
    error: null,
  })
  vi.mocked(recordAudit).mockResolvedValue(undefined as never)
})

afterEach(() => {
  delete process.env.CRON_SECRET
  vi.restoreAllMocks()
})

describe("POST /api/reconciliation/treasury", () => {
  it("401s when not an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      session: null as never,
      error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
    })
    expect((await POST()).status).toBe(401)
  })

  it("503s when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET
    expect((await POST()).status).toBe(503)
  })

  it("proxies the web report (unwrapping { data }), records an audit entry, and returns it", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: report }),
    } as unknown as Response)

    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
    expect(body.nomba.driftMinor).toBe(0)

    // Called the web endpoint with the shared secret.
    const call = fetchSpy.mock.calls[0]!
    expect(String(call[0])).toContain("/api/cron/reconciliation")
    expect((call[1]?.headers as Record<string, string>).authorization).toBe("Bearer secret")

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ adminUserId: "admin-1", action: "RECONCILIATION_RUN" })
    )
  })

  it("502s when the reconciliation service is unreachable", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"))
    expect((await POST()).status).toBe(502)
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("502s when the service returns an unexpected shape", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: { nonsense: true } }),
    } as unknown as Response)
    expect((await POST()).status).toBe(502)
  })
})

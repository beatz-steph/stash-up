import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@workspace/db";
import { getSubAccountBalance } from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { NextRequest } from "next/server";

vi.mock("@/lib/nomba-client", () => ({ getSubAccountBalance: vi.fn() }));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));
vi.mock("@workspace/db", () => ({
  prisma: {
    inboundTransfer: { aggregate: vi.fn(), count: vi.fn() },
    payout: { aggregate: vi.fn(), count: vi.fn() },
    walletWithdrawal: { aggregate: vi.fn(), count: vi.fn() },
  },
}));

const SECRET = "test-secret";
function req(auth: string | null = `Bearer ${SECRET}`) {
  return new NextRequest("http://localhost/api/cron/reconciliation", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  });
}

/** Wire the aggregate/count mocks to a balanced ledger by default. */
function setLedger(over: {
  inbound?: number;
  payoutOut?: [number, number];
  wdOut?: [number, number];
  payoutInFlight?: [number, number];
  wdInFlight?: [number, number];
  stuckPayouts?: number;
  stuckWithdrawals?: number;
  unmatched?: number;
} = {}) {
  const inbound = over.inbound ?? 1_000_000;
  const [pa, pf] = over.payoutOut ?? [0, 0];
  const [wa, wf] = over.wdOut ?? [0, 0];
  const [pia, pif] = over.payoutInFlight ?? [0, 0];
  const [wia, wif] = over.wdInFlight ?? [0, 0];

  vi.mocked(prisma.inboundTransfer.aggregate).mockResolvedValue({ _sum: { amountMinor: inbound } } as never);
  // Key on the `where.status` so settled vs in-flight is order-independent.
  vi.mocked(prisma.payout.aggregate).mockImplementation((args) => {
    const settled = (args as { where?: { status?: unknown } })?.where?.status === "SUCCESS";
    return Promise.resolve({
      _sum: settled ? { amountMinor: pa, feeMinor: pf } : { amountMinor: pia, feeMinor: pif },
    }) as never;
  });
  vi.mocked(prisma.walletWithdrawal.aggregate).mockImplementation((args) => {
    const settled = (args as { where?: { status?: unknown } })?.where?.status === "SUCCESS";
    return Promise.resolve({
      _sum: settled ? { amountMinor: wa, feeMinor: wf } : { amountMinor: wia, feeMinor: wif },
    }) as never;
  });
  vi.mocked(prisma.payout.count).mockResolvedValue((over.stuckPayouts ?? 0) as never);
  vi.mocked(prisma.walletWithdrawal.count).mockResolvedValue((over.stuckWithdrawals ?? 0) as never);
  vi.mocked(prisma.inboundTransfer.count).mockResolvedValue((over.unmatched ?? 0) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(false);
  vi.mocked(getSubAccountBalance).mockResolvedValue({ availableBalanceMinor: 0, ledgerBalanceMinor: 0 });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/reconciliation", () => {
  it("401s without the CRON_SECRET bearer", async () => {
    setLedger();
    expect((await GET(req(null))).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
  });

  it("reports ok with zero drift when Nomba matches the ledger", async () => {
    // inbound 1,000,000 − payout 600,000(+0) → expected 400,000; Nomba agrees.
    setLedger({ inbound: 1_000_000, payoutOut: [600_000, 0] });
    vi.mocked(getSubAccountBalance).mockResolvedValue({ availableBalanceMinor: 400_000, ledgerBalanceMinor: 400_000 });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.status).toBe("ok");
    expect(data.ledger.expectedBalanceMinor).toBe(400_000);
    expect(data.nomba.driftMinor).toBe(0);
  });

  it("flags attention on a real balance drift (beyond in-flight + tolerance)", async () => {
    setLedger({ inbound: 1_000_000 }); // expected 1,000,000
    vi.mocked(getSubAccountBalance).mockResolvedValue({ availableBalanceMinor: 900_000, ledgerBalanceMinor: 900_000 });

    const res = await GET(req());
    const { data } = await res.json();
    expect(data.status).toBe("attention");
    expect(data.nomba.driftMinor).toBe(-100_000);
    expect(data.attention.items.join(" ")).toMatch(/drift/);
  });

  it("does not flag drift that in-flight outbound explains", async () => {
    // expected 1,000,000 but 100,000 is still-in-flight payout already debited.
    setLedger({ inbound: 1_000_000, payoutInFlight: [100_000, 0] });
    vi.mocked(getSubAccountBalance).mockResolvedValue({ availableBalanceMinor: 900_000, ledgerBalanceMinor: 900_000 });

    const res = await GET(req());
    const { data } = await res.json();
    expect(data.status).toBe("ok");
    expect(data.ledger.outstandingOutboundMinor).toBe(100_000);
  });

  it("flags stuck payouts and unmatched inbound transfers", async () => {
    setLedger({ inbound: 1_000_000, stuckPayouts: 2, unmatched: 1 });
    const res = await GET(req());
    const { data } = await res.json();
    expect(data.status).toBe("attention");
    expect(data.attention.stuckPayouts).toBe(2);
    expect(data.attention.unmatchedInbound).toBe(1);
  });

  it("still returns a ledger report when Nomba's balance call is unavailable", async () => {
    setLedger({ inbound: 1_000_000 });
    vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(true);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.nomba.ledgerBalanceMinor).toBeNull();
    expect(data.nomba.error).toBe("integration_disabled");
    expect(data.status).toBe("attention"); // can't fully reconcile → needs a look
  });
});

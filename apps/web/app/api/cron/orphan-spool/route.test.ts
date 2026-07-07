import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { listSubAccountTransactions } from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";

vi.mock("@workspace/db", () => ({
  prisma: {
    inboundTransfer: { findMany: vi.fn() },
    chargeAttempt: { findMany: vi.fn() },
    orphanTransaction: { findMany: vi.fn(), create: vi.fn() },
    virtualAccount: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/nomba-client", () => ({
  listSubAccountTransactions: vi.fn(),
  nairaToKobo: (a: string | number) => Math.round(Number(a) * 100),
}));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));

function req(secret?: string, url = "http://localhost/api/cron/orphan-spool") {
  return new Request(url, {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

const OLD_ENV = process.env;
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...OLD_ENV, CRON_SECRET: "s3cret" };
  vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(false);
  vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.chargeAttempt.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.orphanTransaction.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.orphanTransaction.create).mockResolvedValue({} as never);
});

function vactTx(over: Record<string, unknown> = {}) {
  return {
    id: "API-VACT_TRA-1",
    status: "SUCCESS",
    amount: "100.0",
    source: "api",
    type: "vact_transfer",
    gatewayMessage: "SUCCESS",
    timeCreated: "2026-06-24T11:31:35.017Z",
    ...over,
  };
}

function checkoutTx(over: Record<string, unknown> = {}) {
  return {
    id: "WEB-ONLINE_C-1",
    status: "SUCCESS",
    amount: "500.0",
    source: "web",
    type: "online_checkout",
    gatewayMessage: "PAYMENT SUCCESSFUL",
    timeCreated: "2026-06-24T12:00:00.000Z",
    merchantTxRef: "cardchg_cycle1_mem1_a1",
    ...over,
  };
}

function outboundTx(over: Record<string, unknown> = {}) {
  return {
    id: "API-TRANSFER-1",
    status: "SUCCESS",
    amount: "200.0",
    source: "api",
    type: "transfer",
    gatewayMessage: "Success",
    timeCreated: "2026-06-24T13:00:00.000Z",
    ...over,
  };
}

describe("POST /api/cron/orphan-spool", () => {
  it("401 without the cron secret", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("inserts a genuinely unseen VA credit as an orphan", async () => {
    vi.mocked(listSubAccountTransactions).mockResolvedValue([vactTx()] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();

    expect(data.creditsSeen).toBe(1);
    expect(data.orphansInserted).toBe(1);
    expect(prisma.orphanTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombaTransactionId: "API-VACT_TRA-1",
          virtualAccountId: null,
          amountMinor: 10000,
          entryType: "CREDIT",
          txType: "vact_transfer",
        }),
      })
    );
  });

  it("inserts an unseen card checkout as an orphan", async () => {
    vi.mocked(listSubAccountTransactions).mockResolvedValue([checkoutTx()] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();

    expect(data.orphansInserted).toBe(1);
    expect(prisma.orphanTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombaTransactionId: "WEB-ONLINE_C-1",
          txType: "online_checkout",
          sessionId: "cardchg_cycle1_mem1_a1",
        }),
      })
    );
  });

  it("skips outbound (transfer/withdrawal) transactions", async () => {
    vi.mocked(listSubAccountTransactions).mockResolvedValue([
      outboundTx(),
      outboundTx({ id: "API-WITHDRAW-1", type: "withdrawal" }),
    ] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();
    expect(data.creditsSeen).toBe(0);
    expect(data.outboundSkipped).toBe(2);
    expect(prisma.orphanTransaction.create).not.toHaveBeenCalled();
  });

  it("skips non-SUCCESS rows", async () => {
    vi.mocked(listSubAccountTransactions).mockResolvedValue([
      vactTx({ id: "p1", status: "PENDING_BILLING" }),
      vactTx({ id: "f1", status: "PAYMENT_FAILED" }),
    ] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();
    expect(data.creditsSeen).toBe(0);
    expect(prisma.orphanTransaction.create).not.toHaveBeenCalled();
  });

  it("dedups against an existing InboundTransfer by nombaTransactionId", async () => {
    vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([
      { nombaTransactionId: "API-VACT_TRA-1" },
    ] as never);
    vi.mocked(listSubAccountTransactions).mockResolvedValue([vactTx()] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();
    expect(data.orphansInserted).toBe(0);
    expect(prisma.orphanTransaction.create).not.toHaveBeenCalled();
  });

  it("dedups card checkout against existing ChargeAttempt by orderReference", async () => {
    vi.mocked(prisma.chargeAttempt.findMany).mockResolvedValue([
      { orderReference: "cardchg_cycle1_mem1_a1", nombaTransactionId: null },
    ] as never);
    vi.mocked(listSubAccountTransactions).mockResolvedValue([checkoutTx()] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();
    expect(data.orphansInserted).toBe(0);
    expect(prisma.orphanTransaction.create).not.toHaveBeenCalled();
  });

  it("dedups against existing OrphanTransaction", async () => {
    vi.mocked(prisma.orphanTransaction.findMany).mockResolvedValue([
      { nombaTransactionId: "API-VACT_TRA-1" },
    ] as never);
    vi.mocked(listSubAccountTransactions).mockResolvedValue([vactTx()] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();
    expect(data.orphansInserted).toBe(0);
  });
});

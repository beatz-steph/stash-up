import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { listVirtualAccountTransactions } from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";

vi.mock("@workspace/db", () => ({
  prisma: {
    virtualAccount: { findMany: vi.fn() },
    inboundTransfer: { findMany: vi.fn() },
    orphanTransaction: { findMany: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/nomba-client", () => ({
  listVirtualAccountTransactions: vi.fn(),
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
  vi.mocked(prisma.orphanTransaction.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.orphanTransaction.create).mockResolvedValue({} as never);
});

function creditRow(over: Record<string, unknown> = {}) {
  return {
    id: "API-VACT_TRA-1",
    status: "SUCCESS",
    amount: "100.0",
    type: "vact_transfer",
    entryType: "CREDIT",
    timeCreated: "2026-06-24T11:31:35.017Z",
    senderName: "John Doe",
    narration: "Transfer from John Doe",
    sessionId: "sess-1",
    recipientAccountNumber: "8578228675",
    ...over,
  };
}

describe("POST /api/cron/orphan-spool", () => {
  it("401 without the cron secret", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("inserts a genuinely unseen credit as an orphan", async () => {
    vi.mocked(prisma.virtualAccount.findMany).mockResolvedValue([
      { id: "va-1", bankAccountNumber: "8578228675" },
    ] as never);
    vi.mocked(listVirtualAccountTransactions).mockResolvedValue([creditRow()] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();

    expect(data.orphansInserted).toBe(1);
    expect(prisma.orphanTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombaTransactionId: "API-VACT_TRA-1",
          virtualAccountId: "va-1",
          amountMinor: 10000, // ₦100 → kobo
          entryType: "CREDIT",
          txType: "vact_transfer",
        }),
      })
    );
  });

  it("skips debits and non-success rows", async () => {
    vi.mocked(prisma.virtualAccount.findMany).mockResolvedValue([
      { id: "va-1", bankAccountNumber: "8578228675" },
    ] as never);
    vi.mocked(listVirtualAccountTransactions).mockResolvedValue([
      creditRow({ id: "d1", entryType: "DEBIT" }),
      creditRow({ id: "p1", status: "PENDING_BILLING" }),
    ] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();
    expect(data.orphansInserted).toBe(0);
    expect(prisma.orphanTransaction.create).not.toHaveBeenCalled();
  });

  it("dedups against an existing InboundTransfer by id", async () => {
    vi.mocked(prisma.virtualAccount.findMany).mockResolvedValue([
      { id: "va-1", bankAccountNumber: "8578228675" },
    ] as never);
    vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([
      { nombaTransactionId: "API-VACT_TRA-1", amountMinor: 10000, receivedAt: new Date() },
    ] as never);
    vi.mocked(listVirtualAccountTransactions).mockResolvedValue([creditRow()] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();
    expect(data.orphansInserted).toBe(0);
    expect(prisma.orphanTransaction.create).not.toHaveBeenCalled();
  });

  it("dedups by amount+timestamp when the id differs (missed-webhook safety)", async () => {
    vi.mocked(prisma.virtualAccount.findMany).mockResolvedValue([
      { id: "va-1", bankAccountNumber: "8578228675" },
    ] as never);
    // Same money+instant, different id format than the list endpoint's `id`.
    vi.mocked(prisma.inboundTransfer.findMany).mockResolvedValue([
      {
        nombaTransactionId: "webhook-format-xyz",
        amountMinor: 10000,
        receivedAt: new Date("2026-06-24T11:31:35.017Z"),
      },
    ] as never);
    vi.mocked(listVirtualAccountTransactions).mockResolvedValue([creditRow()] as never);

    const res = await POST(req("s3cret"));
    const { data } = await res.json();
    expect(data.orphansInserted).toBe(0);
  });
});

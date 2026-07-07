import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { getCheckoutTransactionById } from "@/lib/nomba-client";
import { creditWallet } from "@/lib/wallet/ledger";
vi.mock("@workspace/db", () => {
  const transaction = vi.fn((cb) => cb({
    orphanTransaction: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    inboundTransfer: { create: vi.fn().mockResolvedValue({ id: "in-1" }) },
  }));
  return {
    prisma: {
      $transaction: transaction,
      orphanTransaction: { findUnique: vi.fn(), update: vi.fn() },
      user: { findUnique: vi.fn() },
      inboundTransfer: { create: vi.fn().mockResolvedValue({ id: "in-1" }) },
    },
  };
});

vi.mock("@/lib/nomba-client", () => ({ getCheckoutTransactionById: vi.fn() }));
vi.mock("@/lib/wallet/ledger", () => ({ creditWallet: vi.fn() }));

function req(body: any, secret = "test") {
  return new Request("http://localhost/api/internal/resolve-card-orphan", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test";
  vi.mocked(creditWallet).mockResolvedValue({ applied: true, balanceAfterMinor: 1000 });
});

describe("POST /api/internal/resolve-card-orphan", () => {
  it("resolves an online_checkout orphan by crediting the wallet", async () => {
    vi.mocked(prisma.orphanTransaction.findUnique).mockResolvedValue({
      id: "orph-1",
      status: "PENDING",
      txType: "online_checkout",
      nombaTransactionId: "nomba-1",
      amountMinor: 5000,
    } as any);

    // Mock the tx findUnique to also return pending
    const txMock = vi.mocked(prisma.$transaction).mock.calls.length === 0 ? 
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        return cb({
          orphanTransaction: { findUnique: vi.fn().mockResolvedValue({ status: "PENDING" }), update: vi.fn() },
          user: { findUnique: vi.fn() },
          inboundTransfer: { create: vi.fn().mockResolvedValue({ id: "in-1" }) },
        });
      }) : null;

    vi.mocked(getCheckoutTransactionById).mockResolvedValue({ customerEmail: "test@example.com" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", name: "User 1", email: "test@example.com" } as any);

    const res = await POST(req({ orphanId: "orph-1", adminUserId: "a1", note: "done" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.walletCredited).toBe(true);

    expect(creditWallet).toHaveBeenCalled();
  });

  it("returns 400 if orphan is not online_checkout", async () => {
    vi.mocked(prisma.orphanTransaction.findUnique).mockResolvedValue({
      id: "orph-1",
      status: "PENDING",
      txType: "vact_transfer",
    } as any);

    const res = await POST(req({ orphanId: "orph-1", adminUserId: "a1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 if no user found for email", async () => {
    vi.mocked(prisma.orphanTransaction.findUnique).mockResolvedValue({
      id: "orph-1",
      status: "PENDING",
      txType: "online_checkout",
      nombaTransactionId: "nomba-1",
    } as any);

    vi.mocked(getCheckoutTransactionById).mockResolvedValue({ customerEmail: "unknown@example.com" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await POST(req({ orphanId: "orph-1", adminUserId: "a1" }));
    expect(res.status).toBe(404);
  });
});

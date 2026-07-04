import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createMockSession } from "@test/mocks/auth";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@workspace/db", () => ({
  prisma: { walletAccount: { findUnique: vi.fn() } },
}));

describe("GET /api/wallet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns zeros/empty when the user has no wallet yet", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.walletAccount.findUnique).mockResolvedValue(null);
    const res = await GET();
    const { data } = await res.json();
    expect(data).toEqual({ balanceMinor: 0, virtualAccount: null, entries: [] });
  });

  it("returns balance, VA, and mapped ledger entries", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.walletAccount.findUnique).mockResolvedValue({
      balanceMinor: 150_000,
      virtualAccount: {
        bankAccountNumber: "1234567890",
        bankAccountName: "StashUp Wallet Test User",
        bankName: "Nombank MFB",
      },
      entries: [
        {
          id: "e1",
          direction: "CREDIT",
          amountMinor: 150_000,
          balanceAfterMinor: 150_000,
          source: "TOPUP_BANK",
          reference: null,
          createdAt: new Date("2026-07-04T00:00:00Z"),
        },
      ],
    } as never);

    const res = await GET();
    const { data } = await res.json();
    expect(data.balanceMinor).toBe(150_000);
    expect(data.virtualAccount.bankAccountNumber).toBe("1234567890");
    expect(data.entries[0]).toMatchObject({
      id: "e1",
      direction: "CREDIT",
      source: "TOPUP_BANK",
      createdAt: "2026-07-04T00:00:00.000Z",
    });
  });
});

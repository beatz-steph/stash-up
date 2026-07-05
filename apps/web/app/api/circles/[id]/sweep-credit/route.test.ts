import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { creditWallet } from "@/lib/wallet/ledger";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/wallet/ledger", () => ({ creditWallet: vi.fn() }));

const tx = { $queryRaw: vi.fn() };
vi.mock("@workspace/db", () => ({
  Prisma: {},
  prisma: {
    membership: { findUnique: vi.fn() },
    circle: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

function req() {
  return new NextRequest("http://localhost/api/circles/c1/sweep-credit", { method: "POST" });
}
const params = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
  vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", bufferMinor: 250_000 } as never);
  vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "COMPLETED" } as never);
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) =>
    (fn as (t: typeof tx) => unknown)(tx)
  );
  tx.$queryRaw.mockResolvedValue([{ bufferMinor: 250_000 }]); // claim succeeds
  vi.mocked(creditWallet).mockResolvedValue({ applied: true, balanceAfterMinor: 250_000 });
});

describe("POST /api/circles/[id]/sweep-credit", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(req(), params)).status).toBe(401);
  });

  it("403 for a non-member", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);
    expect((await POST(req(), params)).status).toBe(403);
  });

  it("409 while the circle is still ACTIVE (buffer auto-applies)", async () => {
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "ACTIVE" } as never);
    expect((await POST(req(), params)).status).toBe(409);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("400 when there is no leftover credit", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", bufferMinor: 0 } as never);
    expect((await POST(req(), params)).status).toBe(400);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("claims the buffer and credits the wallet as BUFFER_SWEEP", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toEqual({ creditedMinor: 250_000, balanceAfterMinor: 250_000 });
    expect(creditWallet).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: "u1",
        amountMinor: 250_000,
        source: "BUFFER_SWEEP",
        reference: "c1",
      })
    );
    expect(vi.mocked(creditWallet).mock.calls[0]![1].idempotencyKey).toMatch(/^manualbuffer_m1_/);
  });

  it("400 when a concurrent sweep already claimed it (empty claim)", async () => {
    tx.$queryRaw.mockResolvedValue([]); // lost the race — buffer already 0
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

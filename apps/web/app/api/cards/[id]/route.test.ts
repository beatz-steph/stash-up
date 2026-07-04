import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELETE } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { deleteTokenizedCard } from "@/lib/nomba-client";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/nomba-client", () => ({ deleteTokenizedCard: vi.fn() }));
vi.mock("@workspace/db", () => {
  const tx = {
    membership: { updateMany: vi.fn() },
    savedCard: { update: vi.fn() },
  };
  return {
    prisma: {
      savedCard: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});

const params = { params: Promise.resolve({ id: "card1" }) };
function delReq() {
  return new NextRequest("http://localhost/api/cards/card1", { method: "DELETE" });
}

describe("DELETE /api/cards/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteTokenizedCard).mockResolvedValue(true);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await DELETE(delReq(), params);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the card belongs to another user", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      id: "card1",
      userId: "someone-else",
      tokenKey: "x",
      status: "ACTIVE",
    } as never);
    const res = await DELETE(delReq(), params);
    expect(res.status).toBe(404);
  });

  it("deletes the Nomba token, marks REVOKED, and unbinds all memberships", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      id: "card1",
      userId: "u1",
      tokenKey: "SECRET",
      status: "ACTIVE",
    } as never);

    const res = await DELETE(delReq(), params);
    expect(res.status).toBe(200);
    expect(deleteTokenizedCard).toHaveBeenCalledWith("SECRET");

    const tx = (prisma as unknown as { __tx: { membership: { updateMany: ReturnType<typeof vi.fn> }; savedCard: { update: ReturnType<typeof vi.fn> } } }).__tx;
    expect(tx.membership.updateMany).toHaveBeenCalledWith({
      where: { autoDebitCardId: "card1" },
      data: { autoDebitCardId: null },
    });
    expect(tx.savedCard.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "card1" }, data: expect.objectContaining({ status: "REVOKED" }) })
    );
  });

  it("still revokes locally when the Nomba token delete fails", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValue({
      id: "card1",
      userId: "u1",
      tokenKey: "SECRET",
      status: "ACTIVE",
    } as never);
    vi.mocked(deleteTokenizedCard).mockRejectedValue(new Error("nomba down"));

    const res = await DELETE(delReq(), params);
    expect(res.status).toBe(200);
    const tx = (prisma as unknown as { __tx: { savedCard: { update: ReturnType<typeof vi.fn> } } }).__tx;
    expect(tx.savedCard.update).toHaveBeenCalled();
  });
});

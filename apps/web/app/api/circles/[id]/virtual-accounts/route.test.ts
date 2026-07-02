import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/access-control", () => ({ requireCircleMember: vi.fn() }));

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      membership: { findUnique: vi.fn() },
    },
  };
});

describe("GET /api/circles/[id]/virtual-accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the caller's VA (isolation)", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: "m1",
      virtualAccount: { bankAccountNumber: "1234", bankAccountName: "My VA", bankName: "Nombank" }
    } as never);

    const req = new NextRequest("http://localhost/api/circles/circle-1/virtual-accounts");
    const res = await GET(req, { params: Promise.resolve({ id: "circle-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.virtualAccount.bankAccountNumber).toBe("1234");
    // Verify it used the user's ID to fetch
    expect(prisma.membership.findUnique).toHaveBeenCalledWith({
      where: { circleId_userId: { circleId: "circle-1", userId: "user-1" } },
      include: { virtualAccount: true },
    });
  });
});

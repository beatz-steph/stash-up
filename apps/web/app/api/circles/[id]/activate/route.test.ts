import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";
import { acquireActivationLock, releaseActivationLock } from "@/lib/redis";
import { createVirtualAccount } from "@/lib/nomba-client";
import { finalizeActivationIfReady } from "@/lib/circles/activation";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/access-control", () => ({ requireCircleCreator: vi.fn() }));
vi.mock("@/lib/redis", () => ({
  acquireActivationLock: vi.fn(),
  releaseActivationLock: vi.fn(),
}));
vi.mock("@/lib/nomba-client", () => ({ createVirtualAccount: vi.fn() }));
vi.mock("@/lib/circles/activation", () => ({ finalizeActivationIfReady: vi.fn() }));

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      circle: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      membership: { update: vi.fn() },
      virtualAccount: { upsert: vi.fn() },
      $transaction: vi.fn((fn) => fn(prisma)),
    },
  };
});

describe("POST /api/circles/[id]/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 if lock cannot be acquired (double click)", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "creator-1" }));
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "circle-1",
      status: "FORMING",
      totalSlots: 2,
      memberships: [
        { id: "m1", status: "ACTIVE", userId: "u1" },
        { id: "m2", status: "ACTIVE", userId: "u2" },
      ],
    } as never);
    
    vi.mocked(acquireActivationLock).mockResolvedValue(false);

    const req = new NextRequest("http://localhost/api/circles/circle-1/activate", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: "Activation already in progress" });
  });

  it("handles partial Nomba failure gracefully and leaves succeeded VAs persisted", async () => {
    vi.mocked(acquireActivationLock).mockResolvedValue(true);
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "creator-1" }));
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({
      id: "circle-1",
      status: "FORMING",
      totalSlots: 2,
      memberships: [
        { id: "m1", status: "ACTIVE", userId: "u1", vaProvisionStatus: "PENDING" },
        { id: "m2", status: "ACTIVE", userId: "u2", vaProvisionStatus: "PENDING" },
      ],
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user", name: "User" } as never);
    
    // Member 1 succeeds
    vi.mocked(createVirtualAccount).mockResolvedValueOnce({
      bankAccountNumber: "123",
      bankAccountName: "M1",
      bankName: "Nombank",
      bankCode: "000",
      accountRef: "ref-1",
    });
    // Member 2 fails
    vi.mocked(createVirtualAccount).mockRejectedValueOnce(new Error("Nomba offline"));

    vi.mocked(finalizeActivationIfReady).mockResolvedValue(false);

    const req = new NextRequest("http://localhost/api/circles/circle-1/activate", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { activated: false } });

    expect(prisma.virtualAccount.upsert).toHaveBeenCalledTimes(1); // Only m1 persisted
    expect(prisma.membership.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "m1" },
      data: { vaProvisionStatus: "PROVISIONED" }
    }));
    expect(prisma.membership.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "m2" },
      data: { vaProvisionStatus: "FAILED" }
    }));
    expect(releaseActivationLock).toHaveBeenCalledWith("circle-1");
  });
});

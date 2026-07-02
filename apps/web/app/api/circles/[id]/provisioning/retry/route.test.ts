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
      nombaConfig: { findFirst: vi.fn() },
      $transaction: vi.fn((fn) => fn(prisma)),
    },
  };
});

const fullCircle = {
  id: "circle-1",
  status: "FORMING",
  totalSlots: 2,
  memberships: [
    { id: "m1", status: "ACTIVE", userId: "u1", vaProvisionStatus: "FAILED" },
    { id: "m2", status: "ACTIVE", userId: "u2", vaProvisionStatus: "PROVISIONED" },
  ],
};

function req() {
  return new NextRequest("http://localhost/api/circles/circle-1/provisioning/retry", {
    method: "POST",
  });
}

describe("POST /api/circles/[id]/provisioning/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.nombaConfig.findFirst).mockResolvedValue(null); // fail-open default
    vi.mocked(acquireActivationLock).mockResolvedValue(true);
    vi.mocked(finalizeActivationIfReady).mockResolvedValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when NombaConfig.status is INVALID", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "creator-1" }));
    vi.mocked(prisma.circle.findUnique).mockResolvedValue(fullCircle as never);
    vi.mocked(prisma.nombaConfig.findFirst).mockResolvedValue({ status: "INVALID" } as never);

    const res = await POST(req(), { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: "Nomba integration is disabled" });
    // Must not attempt provisioning when disabled
    expect(acquireActivationLock).not.toHaveBeenCalled();
    expect(createVirtualAccount).not.toHaveBeenCalled();
  });

  it("retries only FAILED memberships when config is absent (fail-open)", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "creator-1" }));
    vi.mocked(prisma.circle.findUnique).mockResolvedValue(fullCircle as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", name: "U1" } as never);
    vi.mocked(createVirtualAccount).mockResolvedValue({
      bankAccountNumber: "123",
      bankAccountName: "U1",
      bankName: "Nombank",
      bankCode: "000",
      accountRef: "ref-1",
    });

    const res = await POST(req(), { params: Promise.resolve({ id: "circle-1" }) });

    expect(res.status).toBe(200);
    // Only the FAILED member (m1) is retried, not the already-PROVISIONED m2.
    expect(createVirtualAccount).toHaveBeenCalledTimes(1);
    expect(releaseActivationLock).toHaveBeenCalledWith("circle-1");
  });
});

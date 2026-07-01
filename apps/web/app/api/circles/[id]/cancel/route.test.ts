import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      membership: { findUnique: vi.fn() },
      circle: { findUnique: vi.fn(), update: vi.fn() },
      circleInvite: { updateMany: vi.fn() },
      $transaction: vi.fn((fn) => fn(prisma)),
    },
  };
});

describe("/api/circles/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 if not creator", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "MEMBER" } as any);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 if circle is not FORMING", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as any);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "ACTIVE" } as any);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(403);
  });

  it("cancels circle successfully in transaction", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as any);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "FORMING" } as any);
    vi.mocked(prisma.circle.update).mockResolvedValue({ id: "circle-1", status: "CANCELLED" } as any);
    vi.mocked(prisma.circleInvite.updateMany).mockResolvedValue({ count: 1 } as any);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(200);
    expect(prisma.circle.update).toHaveBeenCalledWith({
      where: { id: "circle-1" },
      data: { status: "CANCELLED" },
    });
    expect(prisma.circleInvite.updateMany).toHaveBeenCalledWith({
      where: { circleId: "circle-1", status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  });
});

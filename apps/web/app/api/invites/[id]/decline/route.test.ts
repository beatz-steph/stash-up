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
      circleInvite: { findUnique: vi.fn(), update: vi.fn() },
    },
  };
});

describe("/api/invites/[id]/decline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 if invite not found or expired", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue(null);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 if invite belongs to someone else", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({
      id: "inv-1",
      invitedUserId: "user-2",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10000),
    } as any);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(403);
  });

  it("declines invite successfully", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({
      id: "inv-1",
      invitedUserId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10000),
    } as any);
    vi.mocked(prisma.circleInvite.update).mockResolvedValue({} as any);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(200);
    expect(prisma.circleInvite.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "DECLINED" },
    });
  });
});

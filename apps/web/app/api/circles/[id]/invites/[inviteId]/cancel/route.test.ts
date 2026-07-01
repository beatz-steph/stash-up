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
      circleInvite: { update: vi.fn() },
    },
  };
});

describe("/api/circles/[id]/invites/[inviteId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1", inviteId: "invite-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 if not creator", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "MEMBER" } as any);
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1", inviteId: "invite-1" }) });
    expect(res.status).toBe(403);
  });

  it("cancels invite successfully", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as any);
    vi.mocked(prisma.circleInvite.update).mockResolvedValue({ id: "invite-1", status: "CANCELLED" } as any);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1", inviteId: "invite-1" }) });
    expect(res.status).toBe(200);
    expect(prisma.circleInvite.update).toHaveBeenCalledWith({
      where: { id: "invite-1" },
      data: { status: "CANCELLED" },
    });
  });
});

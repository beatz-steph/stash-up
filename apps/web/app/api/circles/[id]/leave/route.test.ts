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
      membership: { findUnique: vi.fn(), delete: vi.fn() },
      circle: { findUnique: vi.fn() },
    },
  };
});

describe("/api/circles/[id]/leave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 if not a member", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 if circle is not FORMING", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "MEMBER" } as any);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "ACTIVE" } as any);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 if creator tries to leave", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as any);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "FORMING" } as any);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Creator cannot leave the circle. Cancel the circle instead.");
  });

  it("leaves circle successfully by deleting membership", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "MEMBER" } as any);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "FORMING" } as any);
    vi.mocked(prisma.membership.delete).mockResolvedValue({} as any);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(200);
    expect(prisma.membership.delete).toHaveBeenCalledWith({
      where: { circleId_userId: { circleId: "circle-1", userId: "user-1" } },
    });
  });
});

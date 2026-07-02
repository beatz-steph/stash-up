import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      circleInvite: { findUnique: vi.fn(), update: vi.fn() },
      user: { findUnique: vi.fn() },
      withdrawalAccount: { findUnique: vi.fn() },
      membership: { findMany: vi.fn(), count: vi.fn() },
      circle: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
    Prisma: {
      PrismaClientKnownRequestError: class extends Error {
        code: string;
        clientVersion: string;
        constructor(message: string, params: { code: string; clientVersion: string }) {
          super(message);
          this.code = params.code;
          this.clientVersion = params.clientVersion;
          this.name = "PrismaClientKnownRequestError";
        }
      },
    }
  };
});

import { Prisma } from "@workspace/db";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));

describe("/api/invites/[id]/accept", () => {
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
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue(null);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 if invite belongs to someone else", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({
      id: "inv-1",
      invitedUserId: "user-2",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10000),
    } as never);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 if email is not verified", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1", emailVerified: false }));
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({
      id: "inv-1",
      invitedUserId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10000),
    } as never);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("verify your email");
  });

  it("returns 403 if withdrawal account is missing", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1", emailVerified: true }));
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({
      id: "inv-1",
      invitedUserId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10000),
    } as never);
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue(null);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("withdrawal account");
  });

  it("returns 403 if user blocked from circles", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({
      id: "inv-1",
      circleId: "circle-1",
      invitedUserId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10000),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", blockedFromCircles: true } as never);
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never);
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 409 if circle is full", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({
      id: "inv-1",
      circleId: "circle-1",
      invitedUserId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10000),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", blockedFromCircles: false } as never);
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ id: "circle-1", totalSlots: 5 } as never);
    vi.mocked(prisma.membership.count).mockResolvedValue(5); // full
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(409);
  });

  it("handles P2002 conflict by returning 409", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({
      id: "inv-1",
      circleId: "circle-1",
      invitedUserId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10000),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", blockedFromCircles: false } as never);
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ id: "circle-1", totalSlots: 5, status: "FORMING" } as never);
    vi.mocked(prisma.membership.count).mockResolvedValue(2);
    
    vi.mocked(prisma.$transaction).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Conflict", {
        code: "P2002",
        clientVersion: "7.0.0",
      })
    );
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(409);
    const { error } = await res.json();
    expect(error).toMatch(/Another user joined at the exact same time/);
  });

  it("accepts invite successfully", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({
      id: "inv-1",
      circleId: "circle-1",
      invitedUserId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10000),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", blockedFromCircles: false } as never);
    vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ id: "circle-1", totalSlots: 5, status: "FORMING" } as never);
    vi.mocked(prisma.membership.count).mockResolvedValue(2);
    
    vi.mocked(prisma.$transaction).mockResolvedValue({ id: "mem-1" });
    
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "inv-1" }) });
    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

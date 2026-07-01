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
      membership: { findUnique: vi.fn(), count: vi.fn() },
      circle: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      circleInvite: { count: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
      notification: { create: vi.fn() },
    },
  };
});

describe("/api/circles/[id]/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({}) });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 if user to invite not found", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "FORMING" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ username: "ghost" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 if inviting self", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "FORMING" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1" } as never);
    
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ username: "me" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 if user is blocked", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ role: "CREATOR" } as never);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "FORMING" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-2", blockedFromCircles: true } as never);
    
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ username: "blocked" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 409 if circle is full (capacity check)", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.membership.findUnique)
      .mockResolvedValueOnce({ role: "CREATOR" } as never) // auth check
      .mockResolvedValueOnce(null); // active member check
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "FORMING", totalSlots: 5 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-2", blockedFromCircles: false } as never);
    
    // capacity: 3 active + 2 pending = 5 (full)
    vi.mocked(prisma.membership.count).mockResolvedValue(3);
    vi.mocked(prisma.circleInvite.count).mockResolvedValue(2);
    
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ username: "user2" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(409);
  });

  it("returns 409 if active pending invite exists", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.membership.findUnique)
      .mockResolvedValueOnce({ role: "CREATOR" } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "FORMING", totalSlots: 5 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-2", blockedFromCircles: false } as never);
    vi.mocked(prisma.membership.count).mockResolvedValue(1);
    vi.mocked(prisma.circleInvite.count).mockResolvedValue(0);
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({ status: "PENDING" } as never);
    
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ username: "user2" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(409);
  });

  it("upserts invite and sends notification on success", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.membership.findUnique)
      .mockResolvedValueOnce({ role: "CREATOR" } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.circle.findUnique).mockResolvedValue({ status: "FORMING", totalSlots: 5, name: "Circle" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-2", blockedFromCircles: false } as never);
    vi.mocked(prisma.membership.count).mockResolvedValue(1);
    vi.mocked(prisma.circleInvite.count).mockResolvedValue(0);
    vi.mocked(prisma.circleInvite.findUnique).mockResolvedValue({ status: "DECLINED" } as never);
    vi.mocked(prisma.circleInvite.upsert).mockResolvedValue({ id: "inv-1" } as never);
    
    const req = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ username: "user2" }) });
    const res = await POST(req, { params: Promise.resolve({ id: "circle-1" }) });
    expect(res.status).toBe(201);
    expect(prisma.circleInvite.upsert).toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalled();
  });
});

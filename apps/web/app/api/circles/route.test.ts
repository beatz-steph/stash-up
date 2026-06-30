import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "./route";
import { prisma } from "@workspace/db";
import { auth } from "@/lib/auth";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      withdrawalAccount: { findUnique: vi.fn() },
      circle: { findMany: vi.fn(), create: vi.fn() },
      $transaction: vi.fn((fn) => fn(prisma)),
    },
  };
});

describe("/api/circles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);
      const req = new NextRequest("http://localhost/api/circles", { method: "POST" });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid body", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(
        createMockSession({ id: "user-1", emailVerified: true }) as any
      );
      const req = new NextRequest("http://localhost/api/circles", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 403 if blocked from circles", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(
        createMockSession({ id: "user-1", emailVerified: true }) as any
      );
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", blockedFromCircles: true } as any);
      vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as any);
      const req = new NextRequest("http://localhost/api/circles", {
        method: "POST",
        body: JSON.stringify({
          name: "Test Circle",
          contributionMinor: 500000,
          frequency: "WEEKLY",
          totalSlots: 5,
          startDeadline: new Date(Date.now() + 86400000).toISOString(),
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "You are blocked from participating in circles" });
    });

    it("creates circle and membership successfully", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(
        createMockSession({ id: "user-1", emailVerified: true }) as any
      );
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", blockedFromCircles: false } as any);
      vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as any);
      vi.mocked(prisma.circle.create).mockResolvedValue({ id: "circle-1" } as any);
      
      const req = new NextRequest("http://localhost/api/circles", {
        method: "POST",
        body: JSON.stringify({
          name: "Test Circle",
          contributionMinor: 500000,
          frequency: "WEEKLY",
          totalSlots: 5,
          startDeadline: new Date(Date.now() + 86400000).toISOString(),
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
      expect(prisma.circle.create).toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);
      const req = new NextRequest("http://localhost/api/circles", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("returns circles for user", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(
        createMockSession({ id: "user-1" }) as any
      );
      vi.mocked(prisma.circle.findMany).mockResolvedValue([
        {
          id: "circle-1",
          name: "Circle 1",
          contributionMinor: 1000,
          currency: "NGN",
          frequency: "WEEKLY",
          status: "FORMING",
          totalSlots: 5,
          createdAt: new Date(),
          memberships: [{ role: "CREATOR", status: "ACTIVE" }],
          _count: { memberships: 1 },
        } as any,
      ]);
      const req = new NextRequest("http://localhost/api/circles", { method: "GET" });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].myRole).toBe("CREATOR");
      expect(data[0].filledSlots).toBe(1);
    });
  });
});


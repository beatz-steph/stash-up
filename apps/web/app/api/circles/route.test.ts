import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));

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
      vi.mocked(getSession).mockResolvedValue(null);
      const req = new NextRequest("http://localhost/api/circles", { method: "POST" });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid body", async () => {
      vi.mocked(getSession).mockResolvedValue(
        createMockSession({ id: "user-1", emailVerified: true })
      );
      const req = new NextRequest("http://localhost/api/circles", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 403 if blocked from circles", async () => {
      vi.mocked(getSession).mockResolvedValue(
        createMockSession({ id: "user-1", emailVerified: true })
      );
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", blockedFromCircles: true } as never);
      vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never);
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
      expect(await res.json()).toEqual({ success: false, error: "You are blocked from participating in circles" });
    });

    it("creates circle and membership successfully", async () => {
      vi.mocked(getSession).mockResolvedValue(
        createMockSession({ id: "user-1", emailVerified: true })
      );
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", blockedFromCircles: false } as never);
      vi.mocked(prisma.withdrawalAccount.findUnique).mockResolvedValue({ id: "wa-1" } as never);
      vi.mocked(prisma.circle.create).mockResolvedValue({ id: "circle-1" } as never);
      
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
      vi.mocked(getSession).mockResolvedValue(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns circles for user", async () => {
      vi.mocked(getSession).mockResolvedValue(
        createMockSession({ id: "user-1" })
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
        } as never,
      ]);
      const res = await GET();
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].myRole).toBe("CREATOR");
      expect(data[0].filledSlots).toBe(1);
    });
  });
});


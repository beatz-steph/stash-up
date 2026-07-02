import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      membership: { findUnique: vi.fn() },
      circle: { findUnique: vi.fn() },
      cycle: { findUnique: vi.fn() },
    },
  };
});

describe("/api/circles/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.mocked(getSession).mockResolvedValue(null);
      const req = new NextRequest("http://localhost/api/circles/circle-1", { method: "GET" });
      const res = await GET(req, { params: Promise.resolve({ id: "circle-1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 403 if not a member", async () => {
      vi.mocked(getSession).mockResolvedValue(
        createMockSession({ id: "user-1" })
      );
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);
      
      const req = new NextRequest("http://localhost/api/circles/circle-1", { method: "GET" });
      const res = await GET(req, { params: Promise.resolve({ id: "circle-1" }) });
      expect(res.status).toBe(403);
    });

    it("returns 404 if circle not found", async () => {
      vi.mocked(getSession).mockResolvedValue(
        createMockSession({ id: "user-1" })
      );
      vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "mem-1" } as never);
      vi.mocked(prisma.circle.findUnique).mockResolvedValue(null);
      
      const req = new NextRequest("http://localhost/api/circles/circle-1", { method: "GET" });
      const res = await GET(req, { params: Promise.resolve({ id: "circle-1" }) });
      expect(res.status).toBe(404);
    });

    it("returns circle details", async () => {
      vi.mocked(getSession).mockResolvedValue(
        createMockSession({ id: "user-1" })
      );
      vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "mem-1" } as never);
      vi.mocked(prisma.circle.findUnique).mockResolvedValue({
        id: "circle-1",
        name: "Test",
        contributionMinor: 1000,
        currency: "NGN",
        frequency: "WEEKLY",
        status: "FORMING",
        totalSlots: 5,
        startDeadline: new Date(),
        createdAt: new Date(),
        memberships: [{
          role: "CREATOR",
          payoutPosition: 1,
          status: "ACTIVE",
          user: { id: "user-1", name: "User 1", username: "user1", image: null }
        }],
        invites: [{
          id: "inv-1",
          status: "PENDING",
          expiresAt: new Date(),
          invitedUser: { id: "user-2", name: "User 2", username: "user2", image: null }
        }]
      } as never);
      vi.mocked(prisma.cycle.findUnique).mockResolvedValue({
        id: "cycle-1",
        sequence: 1,
        status: "OPEN",
        potExpectedMinor: 5000,
        potCollectedMinor: 0,
        deadline: new Date(),
        recipientMembershipId: "mem-1",
        contributions: [],
      } as never);
      
      const req = new NextRequest("http://localhost/api/circles/circle-1", { method: "GET" });
      const res = await GET(req, { params: Promise.resolve({ id: "circle-1" }) });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.name).toBe("Test");
      expect(data.members).toHaveLength(1);
      expect(data.invites).toHaveLength(1);
    });
  });
});

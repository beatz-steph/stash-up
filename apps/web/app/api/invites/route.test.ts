import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@workspace/db";
import { auth } from "@/lib/auth";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      circleInvite: { findMany: vi.fn() },
    },
  };
});

describe("/api/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/invites", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns list of invites", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(createMockSession({ id: "user-1" }) as any);
    vi.mocked(prisma.circleInvite.findMany).mockResolvedValue([
      {
        id: "inv-1",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 100000),
        circle: { id: "circle-1", name: "Test Circle", contributionMinor: 1000, frequency: "WEEKLY" },
        invitedBy: { name: "Creator", username: "creator" },
      },
    ] as any);
    
    const req = new NextRequest("http://localhost/api/invites", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].circle.name).toBe("Test Circle");
  });
});

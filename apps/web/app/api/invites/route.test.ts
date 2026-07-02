import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { createMockSession } from "@test/mocks/auth";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));

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
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns list of invites", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(prisma.circleInvite.findMany).mockResolvedValue([
      {
        id: "inv-1",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 100000),
        circle: { id: "circle-1", name: "Test Circle", contributionMinor: 1000, frequency: "WEEKLY" },
        invitedBy: { name: "Creator", username: "creator" },
      },
    ] as never);
    
    const res = await GET();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].circle.name).toBe("Test Circle");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { requireCircleCreator } from "@/lib/access-control";
import { initiatePayout } from "@/lib/payout/initiate";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/access-control", () => ({ requireCircleCreator: vi.fn() }));
vi.mock("@/lib/payout/initiate", () => ({ initiatePayout: vi.fn() }));
vi.mock("@workspace/db", () => {
  return {
    prisma: {
      cycle: { findUnique: vi.fn() },
    },
  };
});

describe("POST /api/circles/[id]/cycles/[cycleId]/payout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated and no CRON_SECRET", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "c1", cycleId: "cy1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 if requireCircleCreator throws", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(requireCircleCreator).mockRejectedValue(new Error("Forbidden"));
    const req = new NextRequest("http://localhost/api", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "c1", cycleId: "cy1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 if cycle does not belong to circle", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(requireCircleCreator).mockResolvedValue(undefined as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ circleId: "other-circle" } as never);
    
    const req = new NextRequest("http://localhost/api", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "c1", cycleId: "cy1" }) });
    expect(res.status).toBe(404);
  });

  it("calls initiatePayout on success", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(requireCircleCreator).mockResolvedValue(undefined as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ circleId: "c1" } as never);
    vi.mocked(initiatePayout).mockResolvedValue(undefined as never);
    
    const req = new NextRequest("http://localhost/api", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "c1", cycleId: "cy1" }) });
    
    expect(res.status).toBe(200);
    expect(initiatePayout).toHaveBeenCalledWith("cy1");
  });

  it("returns 502 if initiatePayout fails", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }));
    vi.mocked(requireCircleCreator).mockResolvedValue(undefined as never);
    vi.mocked(prisma.cycle.findUnique).mockResolvedValue({ circleId: "c1" } as never);
    vi.mocked(initiatePayout).mockRejectedValue(new Error("Nomba down"));
    
    const req = new NextRequest("http://localhost/api", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "c1", cycleId: "cy1" }) });
    
    expect(res.status).toBe(502);
  });
});

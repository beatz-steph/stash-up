import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { prisma } from "@workspace/db";
import { redis } from "@/lib/redis";
import { pingNombaAuth } from "@/lib/nomba-client";

vi.mock("@workspace/db", () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/redis", () => ({ redis: { ping: vi.fn() } }));
vi.mock("@/lib/nomba-client", () => ({ pingNombaAuth: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }] as never);
  vi.mocked(redis.ping).mockResolvedValue("PONG" as never);
  vi.mocked(pingNombaAuth).mockResolvedValue(true);
});

describe("GET /api/health", () => {
  it("returns 200 + status 'ok' when every dependency is up", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(true);
    expect(body.checks.nomba.ok).toBe(true);
  });

  it("degrades (still 200) when Nomba is unreachable but the DB is up", async () => {
    vi.mocked(pingNombaAuth).mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.nomba.ok).toBe(false);
  });

  it("degrades (still 200) when Redis is down but the DB is up", async () => {
    vi.mocked(redis.ping).mockRejectedValue(new Error("redis down"));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.redis.ok).toBe(false);
  });

  it("returns 503 + status 'down' when the database is unreachable", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("down");
    expect(body.checks.database.ok).toBe(false);
  });

  it("never leaks secrets — only ok/latency/error per check", async () => {
    const res = await GET();
    const body = await res.json();
    const keys = Object.keys(body.checks.database).sort();
    expect(keys).toEqual(["latencyMs", "ok"]);
  });
});

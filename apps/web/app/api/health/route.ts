import { prisma } from "@workspace/db";
import { redis } from "@/lib/redis";
import { pingNombaAuth } from "@/lib/nomba-client";

// Never cache — a health probe must reflect live dependency state.
export const dynamic = "force-dynamic";

type Check = { ok: boolean; latencyMs: number; error?: string };

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const startedAt = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Unauthenticated health probe judges (and uptime monitors) can hit to see a
 * green status. Checks the three runtime dependencies:
 *  - database  (Postgres) — the hard dependency; if it's down the app is "down".
 *  - redis     (locks + webhook dedup) — degraded if down.
 *  - nomba     (can we mint an access token?) — degraded if down.
 * Returns 200 when the database is reachable (ok / degraded), 503 when it isn't.
 * No secrets, tokens, or PII are ever included in the response.
 */
export async function GET() {
  const [database, redisCheck, nomba] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(() => redis.ping()),
    timed(async () => {
      const ok = await pingNombaAuth();
      if (!ok) throw new Error("could not obtain Nomba access token");
    }),
  ]);

  const checks = { database, redis: redisCheck, nomba };
  // The database is the only hard dependency — Redis/Nomba being down degrades
  // (writes still work, recovery sweeps catch up) but the service is up.
  const httpUp = database.ok;
  const status = !httpUp ? "down" : Object.values(checks).every((c) => c.ok) ? "ok" : "degraded";

  return Response.json(
    { status, time: new Date().toISOString(), checks },
    { status: httpUp ? 200 : 503 }
  );
}

import "server-only";
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

function createRedisClient(): Redis {
  const client = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });
  // Without an error listener, ioredis surfaces every failed connection attempt
  // as an "Unhandled error event" (which can crash the process). Callers degrade
  // gracefully instead of relying on Redis being up.
  client.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });
  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/**
 * Webhook dedup fast-path — returns true if this event is new (first time seen).
 * Redis is an optimization, NOT the source of truth: if Redis is unavailable we
 * return true so ingestion continues, and the durable dedup falls to the
 * `WebhookReceipt` unique constraint (`provider`, `providerEventId`) in the DB.
 */
export async function claimWebhookEvent(
  provider: string,
  providerEventId: string
): Promise<boolean> {
  try {
    const result = await redis.set(
      `webhook:${provider}:${providerEventId}`,
      "1",
      "EX",
      86400,
      "NX"
    );
    return result === "OK";
  } catch (err) {
    console.error(
      "[redis] claimWebhookEvent degraded to DB dedup:",
      err instanceof Error ? err.message : err
    );
    return true;
  }
}

export async function releaseWebhookEvent(
  provider: string,
  providerEventId: string
): Promise<void> {
  try {
    await redis.del(`webhook:${provider}:${providerEventId}`);
  } catch (err) {
    console.error(
      "[redis] releaseWebhookEvent failed:",
      err instanceof Error ? err.message : err
    );
  }
}

// Payout distributed lock — returns true if lock acquired (safe to proceed).
// Intentionally does NOT degrade gracefully like claimWebhookEvent: if Redis is
// unavailable this throws and the payout is blocked (fail-closed). For money
// movement, refusing to pay under uncertainty is the safe default. Double-pay is
// still prevented by the durable guards even without this lock (Payout.cycleId
// @unique + the in-transaction READY_TO_PAYOUT re-check); the lock only throttles
// concurrent initiations for the same cycle.
export async function acquirePayoutLock(cycleId: string): Promise<boolean> {
  const result = await redis.set(
    `payout:lock:${cycleId}`,
    "1",
    "EX",
    300,
    "NX"
  );
  return result === "OK";
}

export async function releasePayoutLock(cycleId: string): Promise<void> {
  await redis.del(`payout:lock:${cycleId}`);
}

export async function acquireActivationLock(circleId: string): Promise<boolean> {
  const result = await redis.set(
    `activation:lock:${circleId}`,
    "1",
    "EX",
    300,
    "NX"
  );
  return result === "OK";
}

export async function releaseActivationLock(circleId: string): Promise<void> {
  await redis.del(`activation:lock:${circleId}`);
}

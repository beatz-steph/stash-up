import "server-only";
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Webhook dedup — returns true if this event is new (first time seen)
export async function claimWebhookEvent(
  provider: string,
  providerEventId: string
): Promise<boolean> {
  const result = await redis.set(
    `webhook:${provider}:${providerEventId}`,
    "1",
    "EX",
    86400,
    "NX"
  );
  return result === "OK";
}

// Payout distributed lock — returns true if lock acquired (safe to proceed)
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

import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted runs before the hoisted vi.mock factory, so setMock is initialized in time.
const { setMock } = vi.hoisted(() => ({ setMock: vi.fn() }));

vi.mock("ioredis", () => ({
  // Must be constructable (`new Redis(...)`), so use a class, not an arrow fn.
  default: class {
    set = setMock;
    del = vi.fn();
    get = vi.fn();
    on = vi.fn();
  },
}));

import { claimWebhookEvent } from "./redis";

describe("claimWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the event is new (Redis SET NX → OK)", async () => {
    setMock.mockResolvedValue("OK");
    await expect(claimWebhookEvent("NOMBA", "req-1")).resolves.toBe(true);
  });

  it("returns false when already claimed (Redis SET NX → null)", async () => {
    setMock.mockResolvedValue(null);
    await expect(claimWebhookEvent("NOMBA", "req-1")).resolves.toBe(false);
  });

  it("degrades to true (DB-dedup fallback) when Redis is down", async () => {
    setMock.mockRejectedValue(new Error("Stream isn't writeable"));
    await expect(claimWebhookEvent("NOMBA", "req-1")).resolves.toBe(true);
  });
});

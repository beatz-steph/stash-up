import { vi, describe, it, expect, beforeEach } from "vitest";
import type { WebhookReceipt } from "@workspace/db";
import { POST } from "./route";
import { claimWebhookEvent } from "@/lib/redis";
import { verifyNombaSignature } from "@/lib/webhooks/verify";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";
import { prisma } from "@workspace/db";

vi.mock("@/lib/redis", () => ({
  claimWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/webhooks/verify", () => ({
  verifyNombaSignature: vi.fn(),
}));

vi.mock("@/lib/webhooks/dispatch", () => ({
  dispatchWebhookEvent: vi.fn(),
}));

// Setup prisma mock in global setup, just clear it
describe("POST /api/webhooks/nomba", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(claimWebhookEvent).mockResolvedValue(true);
    vi.mocked(verifyNombaSignature).mockReturnValue(true);
    vi.mocked(prisma.webhookReceipt.create).mockResolvedValue({
      id: "receipt-1",
    } as unknown as WebhookReceipt);
  });

  const createRequest = (body: string | Record<string, unknown>, headers = {}) => {
    return new Request("http://localhost:3000/api/webhooks/nomba", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers,
    });
  };

  it("returns 200 and stops on invalid JSON", async () => {
    const req = createRequest("invalid-json");
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 200 and stops if duplicate requestId", async () => {
    vi.mocked(claimWebhookEvent).mockResolvedValue(false);
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(prisma.webhookReceipt.create).not.toHaveBeenCalled();
    expect(dispatchWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 200, persists invalid receipt, and skips dispatch if signature invalid", async () => {
    vi.mocked(verifyNombaSignature).mockReturnValue(false);
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(prisma.webhookReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signatureValid: false }),
      })
    );
    expect(dispatchWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 200, persists receipt, and calls dispatch if signature valid", async () => {
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(prisma.webhookReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signatureValid: true }),
      })
    );
    expect(dispatchWebhookEvent).toHaveBeenCalled();
  });

  it("returns 200 on DB unique violation (P2002) — durable dedup, no dispatch", async () => {
    // This is the path the Redis-down degrade relies on: claim returns true,
    // but the WebhookReceipt unique constraint catches the duplicate.
    vi.mocked(prisma.webhookReceipt.create).mockRejectedValue({ code: "P2002" });
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(dispatchWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected database failure so Nomba retries", async () => {
    vi.mocked(prisma.webhookReceipt.create).mockRejectedValue(new Error("Database connection lost"));
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);
    
    expect(res.status).toBe(500);
  });
});

import { vi, describe, it, expect, beforeEach } from "vitest";
import type { WebhookReceipt } from "@workspace/db";
import { POST } from "./route";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/redis";
import { verifyNombaSignature } from "@/lib/webhooks/verify";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";
import { prisma } from "@workspace/db";

vi.mock("@/lib/redis", () => ({
  claimWebhookEvent: vi.fn(),
  releaseWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/webhooks/verify", () => ({
  verifyNombaSignature: vi.fn(),
}));

vi.mock("@/lib/webhooks/dispatch", () => ({
  dispatchWebhookEvent: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  return {
    prisma: {
      webhookReceipt: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
    },
  };
});

describe("POST /api/webhooks/nomba", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(claimWebhookEvent).mockResolvedValue(true);
    vi.mocked(verifyNombaSignature).mockReturnValue(true);
    vi.mocked(prisma.webhookReceipt.create).mockResolvedValue({
      id: "receipt-1",
      processed: false,
      signatureValid: true,
    } as unknown as WebhookReceipt);
    vi.mocked(prisma.webhookReceipt.update).mockResolvedValue({} as never);
    // Default: dispatch succeeds. Reset here because clearAllMocks() does not
    // reset implementations, so a mockRejectedValue in one test would leak.
    vi.mocked(dispatchWebhookEvent).mockResolvedValue(undefined);
  });

  const createRequest = (body: string | Record<string, unknown>, headers = {}) => {
    return new Request("http://localhost:3000/api/webhooks/nomba", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers,
    });
  };

  it("returns 200 and calls dispatch if signature valid, and updates receipt to processed: true", async () => {
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(prisma.webhookReceipt.create).toHaveBeenCalled();
    expect(dispatchWebhookEvent).toHaveBeenCalled();
    expect(prisma.webhookReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "receipt-1" },
        data: expect.objectContaining({ processed: true }),
      })
    );
  });

  it("releases redis claim on dispatch failure", async () => {
    vi.mocked(dispatchWebhookEvent).mockRejectedValue(new Error("Dispatch crash"));
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);

    expect(res.status).toBe(500); // Route catches, logs, and returns 500
    expect(releaseWebhookEvent).toHaveBeenCalledWith("NOMBA", "req-1");
    // Records the error but must NOT mark the receipt processed.
    expect(prisma.webhookReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processingError: expect.any(String) }),
      })
    );
  });

  it("returns 200 on DB P2002 if processed: true (already processed)", async () => {
    vi.mocked(prisma.webhookReceipt.create).mockRejectedValue({ code: "P2002" });
    vi.mocked(prisma.webhookReceipt.findUnique).mockResolvedValue({ processed: true } as never);
    
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(dispatchWebhookEvent).not.toHaveBeenCalled(); // No double dispatch
  });

  it("re-dispatches on DB P2002 if processed: false (interrupted dispatch)", async () => {
    vi.mocked(prisma.webhookReceipt.create).mockRejectedValue({ code: "P2002" });
    vi.mocked(prisma.webhookReceipt.findUnique).mockResolvedValue({
      id: "receipt-existing",
      processed: false,
      signatureValid: true,
    } as never);
    
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    // Should retry dispatch with the existing receipt
    expect(dispatchWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "receipt-existing" }),
      expect.anything()
    );
    expect(prisma.webhookReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "receipt-existing" },
        data: expect.objectContaining({ processed: true }),
      })
    );
  });

  it("returns 500 and releases Redis lock on unexpected DB error", async () => {
    vi.mocked(prisma.webhookReceipt.create).mockRejectedValue(new Error("Random DB connection crash"));
    const req = createRequest({ event_type: "payment_success", requestId: "req-1" });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(dispatchWebhookEvent).not.toHaveBeenCalled();
    expect(releaseWebhookEvent).toHaveBeenCalledWith("NOMBA", "req-1");
  });
});

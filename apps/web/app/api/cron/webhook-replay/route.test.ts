import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { replayWebhooks } from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { NextRequest } from "next/server";

vi.mock("@/lib/nomba-client", () => ({ replayWebhooks: vi.fn() }));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));

const SECRET = "test-secret";

function req(url = "http://localhost/api/cron/webhook-replay", auth = `Bearer ${SECRET}`) {
  return new NextRequest(url, { method: "POST", headers: auth ? { authorization: auth } : {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(false);
  vi.mocked(replayWebhooks).mockResolvedValue({ description: "Webhook messages re-played" });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("POST /api/cron/webhook-replay", () => {
  it("401s without the CRON_SECRET bearer", async () => {
    expect((await POST(req(undefined, ""))).status).toBe(401);
    expect((await POST(req(undefined, "Bearer wrong"))).status).toBe(401);
    expect(replayWebhooks).not.toHaveBeenCalled();
  });

  it("503s when Nomba is disabled", async () => {
    vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(true);
    expect((await POST(req())).status).toBe(503);
    expect(replayWebhooks).not.toHaveBeenCalled();
  });

  it("replays the safe statuses + money event types over the default 6h window", async () => {
    const before = Date.now();
    const res = await POST(req());
    expect(res.status).toBe(200);

    const arg = vi.mocked(replayWebhooks).mock.calls[0]![0];
    // Never replays PUSHED (already-delivered) events.
    expect(arg.statuses).toEqual(["INITIATED", "FAILED", "INCONCLUSIVE"]);
    expect(arg.statuses).not.toContain("PUSHED");
    expect(arg.eventTypes).toEqual([
      "PAYMENT_SUCCESS",
      "PAYMENT_FAILED",
      "PAYOUT_SUCCESS",
      "PAYOUT_FAILED",
      "ORDER_SUCCESS",
      "PAYMENT_REVERSAL",
      "PAYOUT_REFUND",
    ]);

    // ~6h window ending ~now.
    const from = new Date(arg.startDate).getTime();
    const to = new Date(arg.endDate).getTime();
    expect(to - from).toBe(6 * 60 * 60 * 1000);
    expect(to).toBeGreaterThanOrEqual(before);
  });

  it("honours the ?hours= window override (clamped)", async () => {
    await POST(req("http://localhost/api/cron/webhook-replay?hours=24"));
    const arg = vi.mocked(replayWebhooks).mock.calls[0]![0];
    const span = new Date(arg.endDate).getTime() - new Date(arg.startDate).getTime();
    expect(span).toBe(24 * 60 * 60 * 1000);

    // Out-of-range values clamp to [1, 168].
    vi.clearAllMocks()
    vi.mocked(replayWebhooks).mockResolvedValue({ description: "" });
    await POST(req("http://localhost/api/cron/webhook-replay?hours=9999"));
    const clamped = vi.mocked(replayWebhooks).mock.calls[0]![0];
    const clampedSpan =
      new Date(clamped.endDate).getTime() - new Date(clamped.startDate).getTime();
    expect(clampedSpan).toBe(168 * 60 * 60 * 1000);
  });

  it("502s when the Nomba replay request throws", async () => {
    vi.mocked(replayWebhooks).mockRejectedValue(new Error("nomba down"));
    expect((await POST(req())).status).toBe(502);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, DELETE } from "./route";
import { prisma } from "@workspace/db";
import { getSession } from "@/lib/session";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import {
  submitCardOtp,
  verifyCheckoutTransaction,
  fetchCheckoutTransactionIds,
} from "@/lib/nomba-client";
import { createMockSession } from "@test/mocks/auth";
import { NextRequest } from "next/server";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));
vi.mock("@/lib/nomba-client", () => ({
  submitCardOtp: vi.fn(),
  verifyCheckoutTransaction: vi.fn(),
  fetchCheckoutTransactionIds: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  prisma: { chargeAttempt: { findUnique: vi.fn(), update: vi.fn() } },
}));

function req(body: unknown, method = "POST") {
  return new NextRequest("http://localhost/api/cards/otp", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const OK = { orderReference: "cardchg_x", transactionId: "ord-1", otp: "123456" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
  vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(false);
  vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
    userId: "u1",
    status: "PENDING",
  } as never);
  // Default: the checkout-transaction lookup finds no id; verify supplies it.
  vi.mocked(fetchCheckoutTransactionIds).mockResolvedValue({ ids: [], debug: null });
  vi.mocked(verifyCheckoutTransaction).mockResolvedValue({
    settled: false,
    status: "PENDING",
    transactionId: "txn-real",
    feeMinor: null,
    amountMinor: null,
  });
  vi.mocked(submitCardOtp).mockResolvedValue({ status: true, code: "00", message: "success" });
});

describe("POST /api/cards/otp", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(req(OK))).status).toBe(401);
  });

  it("422 on a non-numeric OTP", async () => {
    expect((await POST(req({ ...OK, otp: "abcd" }))).status).toBe(422);
  });

  it("404 when the orderReference isn't the caller's charge", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      userId: "someone-else",
      status: "PENDING",
    } as never);
    expect((await POST(req(OK))).status).toBe(404);
  });

  it("409 when the charge isn't awaiting an OTP (not PENDING)", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      userId: "u1",
      status: "SUCCESS",
    } as never);
    expect((await POST(req(OK))).status).toBe(409);
    expect(submitCardOtp).not.toHaveBeenCalled();
  });

  it("submits with the looked-up paymentReference and returns submitted", async () => {
    vi.mocked(fetchCheckoutTransactionIds).mockResolvedValue({ ids: ["pay-ref"], debug: null });
    const res = await POST(req(OK));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.submitted).toBe(true);
    // Prefers the checkout transaction's paymentReference over the client's orderId.
    expect(submitCardOtp).toHaveBeenCalledWith({
      otp: "123456",
      orderReference: "cardchg_x",
      transactionId: "pay-ref",
    });
  });

  it("falls back to the orderReference when the first id is 'not found'", async () => {
    vi.mocked(fetchCheckoutTransactionIds).mockResolvedValue({ ids: ["bad-id"], debug: null });
    vi.mocked(submitCardOtp)
      .mockResolvedValueOnce({ status: false, code: "400", message: "No valid transaction found with id: bad-id" })
      .mockResolvedValueOnce({ status: true, code: "00", message: "success" });

    const res = await POST(req(OK));
    expect(res.status).toBe(200);
    // Retried with the orderReference as the transaction id after the miss.
    expect(submitCardOtp).toHaveBeenNthCalledWith(2, {
      otp: "123456",
      orderReference: "cardchg_x",
      transactionId: "cardchg_x",
    });
  });

  it("409 with guidance when the charge is already terminal (bank declined)", async () => {
    vi.mocked(fetchCheckoutTransactionIds).mockResolvedValue({ ids: ["pay-ref"], debug: null });
    vi.mocked(submitCardOtp).mockResolvedValue({
      status: false, code: "400", message: "Transaction with id pay-ref already completed.",
    });
    vi.mocked(verifyCheckoutTransaction).mockResolvedValue({
      settled: false, status: "FAILED", transactionId: null, feeMinor: null, amountMinor: null,
    });
    const res = await POST(req(OK));
    expect(res.status).toBe(409);
    expect(submitCardOtp).toHaveBeenCalledTimes(1); // "already completed" is not retried across ids
  });

  it("400 immediately on a real OTP error (no retry against other ids)", async () => {
    vi.mocked(submitCardOtp).mockResolvedValue({ status: false, code: "400", message: "Invalid OTP" });
    expect((await POST(req(OK))).status).toBe(400);
    expect(submitCardOtp).toHaveBeenCalledTimes(1); // did not cycle ids on a bad OTP
  });

  it("502 when the Nomba call throws", async () => {
    vi.mocked(submitCardOtp).mockRejectedValue(new Error("nomba down"));
    expect((await POST(req(OK))).status).toBe(502);
  });
});

describe("DELETE /api/cards/otp (abandon)", () => {
  const body = { orderReference: "cardchg_x" };

  it("401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await DELETE(req(body, "DELETE"))).status).toBe(401);
  });

  it("404 when the charge isn't the caller's", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "a1", userId: "someone-else", status: "PENDING",
    } as never);
    expect((await DELETE(req(body, "DELETE"))).status).toBe(404);
  });

  it("fails the PENDING attempt so a retry isn't blocked", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "a1", userId: "u1", status: "PENDING",
    } as never);
    const res = await DELETE(req(body, "DELETE"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.cancelled).toBe(true);
    expect(prisma.chargeAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a1" }, data: { status: "FAILED", failureReason: "otp_abandoned" } })
    );
  });

  it("is a no-op when the attempt already settled (not PENDING)", async () => {
    vi.mocked(prisma.chargeAttempt.findUnique).mockResolvedValue({
      id: "a1", userId: "u1", status: "SUCCESS",
    } as never);
    const res = await DELETE(req(body, "DELETE"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.cancelled).toBe(false);
    expect(prisma.chargeAttempt.update).not.toHaveBeenCalled();
  });
});

import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { verifyNombaSignature } from "./verify";

describe("verifyNombaSignature", () => {
  const mockKey = "test-secret-key";
  const timestamp = new Date().toISOString();
  const payload = {
    event_type: "payment_success",
    requestId: "req-123",
    data: {
      merchant: {
        userId: "user-1",
        walletId: "wallet-1",
      },
      transaction: {
        transactionId: "txn-1",
        type: "CREDIT",
        time: "2026-06-29T10:00:00Z",
        responseCode: "00",
      },
    },
  };

  const stringToSign = `payment_success:req-123:user-1:wallet-1:txn-1:CREDIT:2026-06-29T10:00:00Z:00:${timestamp}`;
  const validSignature = crypto.createHmac("sha256", mockKey).update(stringToSign).digest("base64");

  it("returns true for a valid signature", () => {
    const isValid = verifyNombaSignature({
      payload,
      signature: validSignature,
      timestamp,
      signatureKey: mockKey,
    });
    expect(isValid).toBe(true);
  });

  it("returns false for a tampered payload", () => {
    const tamperedPayload = {
      ...payload,
      data: {
        ...payload.data,
        transaction: {
          ...payload.data.transaction,
          responseCode: "99",
        },
      },
    };

    const isValid = verifyNombaSignature({
      payload: tamperedPayload,
      signature: validSignature,
      timestamp,
      signatureKey: mockKey,
    });
    expect(isValid).toBe(false);
  });

  it("returns false for wrong key", () => {
    const isValid = verifyNombaSignature({
      payload,
      signature: validSignature,
      timestamp,
      signatureKey: "wrong-key",
    });
    expect(isValid).toBe(false);
  });

  it("treats 'null' responseCode as empty string", () => {
    const payloadWithNull = {
      ...payload,
      data: {
        ...payload.data,
        transaction: {
          ...payload.data.transaction,
          responseCode: "null",
        },
      },
    };
    const stringToSignNull = `payment_success:req-123:user-1:wallet-1:txn-1:CREDIT:2026-06-29T10:00:00Z::${timestamp}`;
    const sigNull = crypto.createHmac("sha256", mockKey).update(stringToSignNull).digest("base64");

    const isValid = verifyNombaSignature({
      payload: payloadWithNull,
      signature: sigNull,
      timestamp,
      signatureKey: mockKey,
    });
    expect(isValid).toBe(true);
  });

  it("length-guard rejects malformed signature without throwing", () => {
    expect(() => {
      const isValid = verifyNombaSignature({
        payload,
        signature: "too-short",
        timestamp,
        signatureKey: mockKey,
      });
      expect(isValid).toBe(false);
    }).not.toThrow();
  });
});

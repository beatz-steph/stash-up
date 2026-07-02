import crypto from "crypto";

export interface NombaWebhookPayload {
  event_type: string;
  requestId: string;
  data: {
    merchant?: {
      userId?: string;
      walletId?: string;
    };
    transaction?: {
      transactionId?: string;
      type?: string;
      time?: string;
      responseCode?: string;
      transactionAmount?: number | string;
      merchantTxRef?: string;
      aliasAccountReference?: string;
      currency?: string;
      senderName?: string;
      senderBank?: string;
      senderBankCode?: string;
      senderAccountNumber?: string;
      narration?: string;
    };
  };
}

export interface VerifyNombaSignatureInput {
  payload: NombaWebhookPayload;
  signature: string;
  timestamp: string;
  signatureKey: string;
}

export function verifyNombaSignature({
  payload,
  signature,
  timestamp,
  signatureKey,
}: VerifyNombaSignatureInput): boolean {
  if (!signature || !timestamp || !signatureKey) return false;

  const m = payload.data?.merchant || {};
  const t = payload.data?.transaction || {};

  const cleanResponseCode = (code: string | undefined) => {
    if (!code || code === "null") return "";
    return code;
  };

  // Per Nomba: {event_type}:{requestId}:{userId}:{walletId}:{transactionId}:{type}:{time}:{responseCode}:{nomba-timestamp}
  const fields = [
    payload.event_type || "",
    payload.requestId || "",
    m.userId || "",
    m.walletId || "",
    t.transactionId || "",
    t.type || "",
    t.time || "",
    cleanResponseCode(t.responseCode),
    timestamp,
  ];

  const stringToSign = fields.join(":");

  const hmac = crypto.createHmac("sha256", signatureKey);
  hmac.update(stringToSign);
  const computedSignature = hmac.digest("base64");

  const computedBuffer = Buffer.from(computedSignature);
  const signatureBuffer = Buffer.from(signature);

  if (computedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
}

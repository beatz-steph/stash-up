import "server-only";
import { randomUUID } from "node:crypto";
import { redis } from "@/lib/redis";

const BASE_URL = process.env.NOMBA_BASE_URL!;
const CLIENT_ID = process.env.NOMBA_CLIENT_ID!;
const CLIENT_SECRET = process.env.NOMBA_CLIENT_SECRET!;
const ACCOUNT_ID = process.env.NOMBA_ACCOUNT_ID!;
const SUB_ACCOUNT_ID = process.env.NOMBA_SUB_ACCOUNT_ID!;

const TOKEN_KEY = "nomba:token";
const TOKEN_LOCK_KEY = "nomba:token:lock";
const TOKEN_LOCK_TTL_SEC = 15;
const TOKEN_LOCK_POLL_MS = 250;
const TOKEN_LOCK_POLL_BUDGET_MS = 5000;
const TOKEN_FETCH_TIMEOUT_MS = 8000;
// Token is valid for 25 min (server-side TTL 26 min). Background refresh
// kicks in 5 min before expiry so steady-state callers never block on auth.
const TOKEN_TTL_MS = 25 * 60 * 1000;
const TOKEN_REFRESH_AFTER_MS = 20 * 60 * 1000;
const TOKEN_REDIS_TTL_SEC = 26 * 60;

interface NombaToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  /** Timestamp after which a background refresh should be triggered, while the token is still served as valid. */
  refresh_after: number;
}

/**
 * Pure decision function for getToken()'s branching — kept side-effect free
 * so it can be unit tested without mocking Redis/fetch.
 * - "block": no usable token (absent or past expires_at) — caller must await a fetch.
 * - "use+refresh": token still valid but past refresh_after — serve it immediately,
 *   kick a background refresh so the NEXT call doesn't pay the latency.
 * - "use": token comfortably valid — serve as-is.
 */
export function decideTokenAction(
  token: NombaToken | null,
  now: number
): "use" | "use+refresh" | "block" {
  if (!token || now >= token.expires_at) {
    return "block";
  }
  if (now >= token.refresh_after) {
    return "use+refresh";
  }
  return "use";
}

let tokenPromise: Promise<NombaToken> | null = null;
// Guards against overlapping background refreshes fired from the same instance
// (the module-level dedup above only covers the blocking path).
let backgroundRefreshInFlight = false;

function withDeadline(init: RequestInit = {}): RequestInit {
  return { ...init, signal: AbortSignal.timeout(TOKEN_FETCH_TIMEOUT_MS) };
}

function toNombaToken(data: { data: { access_token: string; refresh_token: string } }): NombaToken {
  const now = Date.now();
  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_at: now + TOKEN_TTL_MS,
    refresh_after: now + TOKEN_REFRESH_AFTER_MS,
  };
}

async function persistToken(token: NombaToken): Promise<void> {
  await redis.set(TOKEN_KEY, JSON.stringify(token), "EX", TOKEN_REDIS_TTL_SEC);
}

/** Cross-instance lock — SET NX EX, released via a compare-and-del Lua script so an instance never releases a lock it doesn't own. */
async function acquireTokenLock(): Promise<string | null> {
  const id = randomUUID();
  const result = await redis.set(TOKEN_LOCK_KEY, id, "EX", TOKEN_LOCK_TTL_SEC, "NX");
  return result === "OK" ? id : null;
}

async function releaseTokenLock(id: string): Promise<void> {
  // Only delete if the value still matches our id (compare-and-del) so a slow
  // holder can't release a lock a later instance has since acquired.
  await redis.eval(
    `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
    1,
    TOKEN_LOCK_KEY,
    id
  );
}

async function readCachedToken(): Promise<NombaToken | null> {
  const raw = await redis.get(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as NombaToken) : null;
}

async function fetchNewToken(): Promise<NombaToken> {
  const res = await fetch(
    `${BASE_URL}/v1/auth/token/issue`,
    withDeadline({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accountId: ACCOUNT_ID,
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    })
  );

  if (!res.ok) {
    throw new Error(`Nomba auth failed: ${res.status} ${await res.text()}`);
  }

  const token = toNombaToken(await res.json());
  await persistToken(token);
  return token;
}

async function doRefreshToken(token: NombaToken): Promise<NombaToken> {
  const res = await fetch(
    `${BASE_URL}/v1/auth/token/refresh`,
    withDeadline({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accountId: ACCOUNT_ID,
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      }),
    })
  );

  if (!res.ok) {
    return fetchNewToken();
  }

  const refreshed = toNombaToken(await res.json());
  await persistToken(refreshed);
  return refreshed;
}

/**
 * Fetch a fresh token while holding (or waiting out) the cross-instance lock.
 * Used only by the blocking path — if another instance already holds the
 * lock, poll Redis for the token it's about to publish instead of also
 * hitting the Nomba auth endpoint (thundering-herd prevention).
 */
async function fetchNewTokenWithLock(): Promise<NombaToken> {
  const lockId = await acquireTokenLock();
  if (!lockId) {
    const deadline = Date.now() + TOKEN_LOCK_POLL_BUDGET_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, TOKEN_LOCK_POLL_MS));
      const cached = await readCachedToken();
      if (cached && decideTokenAction(cached, Date.now()) !== "block") {
        return cached;
      }
    }
    // Gave up waiting on the other holder — fetch ourselves rather than block forever.
    return fetchNewToken();
  }

  try {
    return await fetchNewToken();
  } finally {
    await releaseTokenLock(lockId);
  }
}

/**
 * Fire a background refresh without blocking the caller. Skips if another
 * instance already holds the refresh lock (someone else is doing it) or if
 * this instance already has one in flight.
 */
function refreshInBackground(token: NombaToken): void {
  if (backgroundRefreshInFlight) return;
  backgroundRefreshInFlight = true;

  void (async () => {
    const lockId = await acquireTokenLock();
    if (!lockId) return; // another instance is already refreshing
    try {
      await doRefreshToken(token);
    } finally {
      await releaseTokenLock(lockId);
    }
  })()
    .catch((err) => {
      console.error(
        "[nomba-client] background token refresh failed:",
        err instanceof Error ? err.message : err
      );
    })
    .finally(() => {
      backgroundRefreshInFlight = false;
    });
}

async function getToken(): Promise<string> {
  // Deduplicate concurrent blocking token requests within this instance.
  if (tokenPromise) {
    return (await tokenPromise).access_token;
  }

  const cached = await readCachedToken();
  const action = decideTokenAction(cached, Date.now());

  if (action === "use") {
    return cached!.access_token;
  }

  if (action === "use+refresh") {
    refreshInBackground(cached!);
    return cached!.access_token;
  }

  // action === "block": no usable token — must fetch before proceeding.
  tokenPromise = fetchNewTokenWithLock().finally(() => {
    tokenPromise = null;
  });
  return (await tokenPromise).access_token;
}

async function nombaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      accountId: ACCOUNT_ID,
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

interface CreateVirtualAccountParams {
  accountRef: string;
  accountName: string;
  bvn?: string;
}

import { z } from "zod";

const VirtualAccountResponseSchema = z.object({
  bankAccountNumber: z.string(),
  bankAccountName: z.string(),
  bankName: z.string().optional().default("Nombank MFB"),
  // bankCode is not returned by Nomba's VA creation endpoint.
  // It is unused functionally because we only do outbound payouts to external WithdrawalAccounts (which have real bankCodes).
  bankCode: z.string().optional().default(""),
  accountRef: z.string(),
});

export async function createVirtualAccount(params: CreateVirtualAccountParams) {
  const res = await nombaFetch(`/v1/accounts/virtual/${SUB_ACCOUNT_ID}`, {
    method: "POST",
    body: JSON.stringify({
      accountRef: params.accountRef,
      accountName: params.accountName,
      ...(params.bvn ? { bvn: params.bvn } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Create virtual account failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const parsed = VirtualAccountResponseSchema.safeParse(data?.data);
  if (!parsed.success) {
    // Nomba can return 2xx with an error envelope (no `data`) e.g. when it
    // rejects the account name. Surface the code/description so it's clear.
    throw new Error(
      `Create virtual account: unexpected Nomba response (code=${data?.code ?? "?"}): ${
        data?.description ?? "no data field in response"
      }`
    );
  }
  return parsed.data;
}

interface BankTransferParams {
  amount: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration: string;
  merchantTxRef: string;
}

export async function initiateSubAccountBankTransfer(params: BankTransferParams) {
  const res = await nombaFetch(`/v2/transfers/bank/${SUB_ACCOUNT_ID}`, {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Payout failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()).data;
}

export async function getSubAccountBalance() {
  const res = await nombaFetch(`/v1/accounts/${SUB_ACCOUNT_ID}/balance`);

  if (!res.ok) {
    throw new Error(`Fetch balance failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return {
    availableBalanceMinor: Math.round(data.data.availableBalance * 100),
    ledgerBalanceMinor: Math.round(data.data.ledgerBalance * 100),
  };
}

interface ResolveBankAccountParams {
  accountNumber: string;
  bankCode: string;
}

export async function resolveBankAccount(params: ResolveBankAccountParams) {
  const res = await nombaFetch("/v1/transfers/bank/lookup", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Name enquiry failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (data.code !== "00") {
    throw new Error(`Name enquiry unsuccessful: ${data.description}`);
  }

  return {
    accountName: data.data.accountName as string,
  };
}

export async function getBanks() {
  const res = await nombaFetch("/v1/transfers/banks");

  if (!res.ok) {
    throw new Error(`Fetch banks failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (data.code !== "00") {
    throw new Error(`Fetch banks unsuccessful: ${data.description}`);
  }

  return data.data as {
    code: string;
    name: string;
  }[];
}

// GET /v1/transactions/virtual — one row per transaction on a virtual account.
// Only the fields the orphan spool needs; the response has many more.
const VirtualAccountTxSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.union([z.string(), z.number()]), // naira, sometimes a string ("100.0")
  type: z.string().optional(), // e.g. "vact_transfer"
  entryType: z.string().optional(), // "CREDIT" | "DEBIT"
  timeCreated: z.string(),
  senderName: z.string().nullish(),
  narration: z.string().nullish(),
  sessionId: z.string().nullish(),
  recipientAccountNumber: z.string().nullish(),
});
export type VirtualAccountTx = z.infer<typeof VirtualAccountTxSchema>;

const VirtualAccountTxPageSchema = z.object({
  cursor: z.string().optional().default(""),
  results: z.array(VirtualAccountTxSchema).default([]),
});

/** Naira amount (number or "100.0") → kobo Int. */
export function nairaToKobo(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}

/**
 * List transactions on a single virtual account within a UTC date window.
 * Pages through the cursor and returns every row (bounded by maxPages so a
 * runaway cursor can't loop forever). `from`/`to` are ISO-8601 UTC strings.
 */
export async function listVirtualAccountTransactions(params: {
  virtualAccount: string;
  from: string;
  to: string;
  limit?: number;
  maxPages?: number;
}): Promise<VirtualAccountTx[]> {
  const { virtualAccount, from, to, limit = 100, maxPages = 20 } = params;
  const rows: VirtualAccountTx[] = [];
  let cursor = "";

  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({
      virtual_account: virtualAccount,
      dateFrom: from,
      dateTo: to,
      limit: String(limit),
    });
    if (cursor) qs.set("cursor", cursor);

    const res = await nombaFetch(`/v1/transactions/virtual?${qs.toString()}`);
    if (!res.ok) {
      throw new Error(
        `List virtual-account transactions failed: ${res.status} ${await res.text()}`
      );
    }

    const data = await res.json();
    const parsed = VirtualAccountTxPageSchema.safeParse(data?.data);
    if (!parsed.success) {
      throw new Error(
        `List virtual-account transactions: unexpected Nomba response (code=${
          data?.code ?? "?"
        }): ${data?.description ?? "no data field"}`
      );
    }

    rows.push(...parsed.data.results);
    cursor = parsed.data.cursor;
    if (!cursor) break; // empty cursor = no more pages
  }

  return rows;
}

// ─── Card rails (checkout / tokenized charges / refunds) ─────────────────────
// All amounts cross the Nomba boundary as naira doubles; storage stays kobo.

/** Kobo Int → naira number for the Nomba boundary (e.g. 1000000 → 10000). */
export function koboToNaira(minor: number): number {
  return minor / 100;
}

const CheckoutOrderResponseSchema = z.object({
  checkoutLink: z.string(),
  orderReference: z.string(),
});

/**
 * Create a hosted-checkout order. When `tokenizeCard` is true we force
 * `allowedPaymentMethods: ["Card"]` so the customer can only pay by card
 * (a Transfer/USSD payment would settle the order but tokenize NO card —
 * a silent enrollment failure). `metadata` is echoed back in webhooks.
 * Returns `{ checkoutLink, orderReference }` — redirect the member there.
 */
export async function createCheckoutOrder(params: {
  orderReference: string;
  customerEmail: string;
  amountMinor: number;
  callbackUrl: string;
  tokenizeCard: boolean;
  metadata?: Record<string, string>;
}) {
  const res = await nombaFetch("/v1/checkout/order", {
    method: "POST",
    body: JSON.stringify({
      order: {
        orderReference: params.orderReference,
        customerEmail: params.customerEmail,
        amount: koboToNaira(params.amountMinor),
        currency: "NGN",
        callbackUrl: params.callbackUrl,
        // Card money lands in the same sub-account wallet as VA inflows/payouts.
        accountId: SUB_ACCOUNT_ID,
        ...(params.tokenizeCard ? { allowedPaymentMethods: ["Card"] } : {}),
        ...(params.metadata ? { orderMetaData: params.metadata } : {}),
      },
      tokenizeCard: params.tokenizeCard,
    }),
  });

  if (!res.ok) {
    throw new Error(`Create checkout order failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const parsed = CheckoutOrderResponseSchema.safeParse(data?.data);
  if (!parsed.success) {
    throw new Error(
      `Create checkout order: unexpected Nomba response (code=${data?.code ?? "?"}): ${
        data?.description ?? "no data field"
      }`
    );
  }
  return parsed.data;
}

const TokenizedChargeResponseSchema = z.object({
  status: z.boolean(),
  message: z.string().optional().default(""),
  // Present on accounts where the charge is 3DS/OTP-gated: the customer is asked
  // to enter an OTP, and orderId is the transaction handle needed to submit it.
  orderId: z.string().nullish(),
  orderReference: z.string().nullish(),
});

export interface TokenizedChargeResult {
  /** Nomba's `data.status` — true when the charge was accepted OR an OTP sent. */
  status: boolean;
  message: string;
  /** True when the account runs the tokenized charge through a 3DS/OTP step:
   *  the charge is NOT settled and needs `submitCardOtp` to complete. */
  otpRequired: boolean;
  /** Transaction handle to pass to `submitCardOtp` as `transactionId`. */
  orderId: string | null;
  orderReference: string;
}

/**
 * Charge a previously-tokenized card. Sends `X-Idempotent-key: <orderReference>`
 * so a network-dropped call can be retried without double-charging. The sync
 * response is `{ status, message }` — but on 3DS/OTP-gated accounts a `true`
 * status only means "OTP sent", NOT settled (message asks the customer to enter
 * an OTP). Callers must branch on `otpRequired` and drive `submitCardOtp`.
 * Settlement truth still comes from the webhook / verify backstop.
 * NEVER log `tokenKey` (or any PAN data).
 */
export async function chargeTokenizedCard(params: {
  orderReference: string;
  customerEmail: string;
  amountMinor: number;
  tokenKey: string;
  metadata?: Record<string, string>;
}) {
  const res = await nombaFetch("/v1/checkout/tokenized-card-payment", {
    method: "POST",
    headers: { "X-Idempotent-key": params.orderReference },
    body: JSON.stringify({
      order: {
        orderReference: params.orderReference,
        customerEmail: params.customerEmail,
        amount: koboToNaira(params.amountMinor),
        currency: "NGN",
        accountId: SUB_ACCOUNT_ID,
        ...(params.metadata ? { orderMetaData: params.metadata } : {}),
      },
      tokenKey: params.tokenKey,
    }),
  });

  if (!res.ok) {
    // Error body never contains tokenKey — safe to surface.
    throw new Error(`Tokenized card charge failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const parsed = TokenizedChargeResponseSchema.safeParse(data?.data);
  if (!parsed.success) {
    throw new Error(
      `Tokenized card charge: unexpected Nomba response (code=${data?.code ?? "?"}): ${
        data?.description ?? "no data field"
      }`
    );
  }
  const message = parsed.data.message;
  // 3DS/OTP-gated accounts return status:true with a "enter the OTP" message and
  // an orderId to complete against. Detect it so callers drive the OTP step
  // instead of pretending the charge is already settling.
  const otpRequired = /\botp\b/i.test(message);
  return {
    status: parsed.data.status,
    message,
    otpRequired,
    orderId: parsed.data.orderId ?? null,
    orderReference: parsed.data.orderReference ?? params.orderReference,
  } satisfies TokenizedChargeResult;
}

const SubmitOtpResponseSchema = z.object({
  status: z.boolean(),
  message: z.string().optional().default(""),
});

/**
 * Complete a 3DS/OTP-gated tokenized charge by submitting the OTP the customer
 * received. `transactionId` is the `orderId` returned by `chargeTokenizedCard`.
 * On success Nomba finishes the charge and fires the settlement webhook, which
 * our existing handlers apply. NEVER log the OTP.
 */
export async function submitCardOtp(params: {
  otp: string;
  orderReference: string;
  transactionId: string;
}): Promise<{ status: boolean; message: string }> {
  const res = await nombaFetch("/v1/checkout/checkout-card-otp", {
    method: "POST",
    body: JSON.stringify({
      otp: params.otp,
      orderReference: params.orderReference,
      transactionId: params.transactionId,
    }),
  });

  if (!res.ok) {
    throw new Error(`Submit card OTP failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const parsed = SubmitOtpResponseSchema.safeParse(data?.data);
  if (!parsed.success) {
    throw new Error(
      `Submit card OTP: unexpected Nomba response (code=${data?.code ?? "?"}): ${
        data?.description ?? "no data field"
      }`
    );
  }
  return parsed.data;
}

const RefundResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional().default(""),
});

/**
 * Refund a settled checkout transaction to source. Keys on Nomba's
 * `transactionId` (captured from the settlement webhook/verify) — NOT our
 * orderReference. Omitting accountNumber/bankCode refunds to the source card.
 */
export async function refundCheckoutTransaction(params: {
  transactionId: string;
  amountMinor: number;
}) {
  const res = await nombaFetch("/v1/checkout/refund", {
    method: "POST",
    body: JSON.stringify({
      transactionId: params.transactionId,
      amount: koboToNaira(params.amountMinor),
    }),
  });

  if (!res.ok) {
    throw new Error(`Checkout refund failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const parsed = RefundResponseSchema.safeParse(data?.data);
  if (!parsed.success) {
    throw new Error(
      `Checkout refund: unexpected Nomba response (code=${data?.code ?? "?"}): ${
        data?.description ?? "no data field"
      }`
    );
  }
  return parsed.data;
}

/** Delete a stored card token (user removed the card). NEVER log tokenKey. */
export async function deleteTokenizedCard(tokenKey: string): Promise<boolean> {
  const res = await nombaFetch("/v1/checkout/tokenized-card-data", {
    method: "DELETE",
    body: JSON.stringify({ tokenKey }),
  });

  if (!res.ok) {
    // Error body never contains tokenKey — safe to surface.
    throw new Error(`Delete tokenized card failed: ${res.status} ${await res.text()}`);
  }
  return true;
}

const CheckoutTransactionSchema = z
  .object({
    status: z.string(),
    // Field name varies by endpoint; capture both and prefer transactionId.
    transactionId: z.string().nullish(),
    id: z.string().nullish(),
    // Present on settled transactions — lets the verify backstop apply the
    // exact NET (amount − fee) instead of estimating from the grossed charge.
    // Field names vary by endpoint, so capture every spelling we've seen.
    fee: z.union([z.number(), z.string()]).nullish(),
    amount: z.union([z.number(), z.string()]).nullish(),
    transactionAmount: z.union([z.number(), z.string()]).nullish(),
  })
  .passthrough();

/**
 * Verify a checkout transaction by our orderReference — the reconcile-sweep
 * backstop for attempts stuck PENDING (webhook missed) and the source of
 * `nombaTransactionId` for refunds. Settled only when status === "SUCCESS".
 */
export async function verifyCheckoutTransaction(orderReference: string): Promise<{
  settled: boolean;
  status: string;
  transactionId: string | null;
  // NET/fee in kobo when the settled transaction reports them; null otherwise
  // (the caller then estimates from the grossed charge amount).
  feeMinor: number | null;
  amountMinor: number | null;
}> {
  const qs = new URLSearchParams({ orderReference });
  const res = await nombaFetch(`/v1/transactions/accounts/single?${qs.toString()}`);

  if (!res.ok) {
    throw new Error(`Verify checkout transaction failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const parsed = CheckoutTransactionSchema.safeParse(data?.data);
  if (!parsed.success) {
    throw new Error(
      `Verify checkout transaction: unexpected Nomba response (code=${data?.code ?? "?"}): ${
        data?.description ?? "no data field"
      }`
    );
  }

  const toMinor = (v: number | string | null | undefined): number | null =>
    v === null || v === undefined || v === "" ? null : Math.round(Number(v) * 100);
  const grossMinor = toMinor(parsed.data.transactionAmount ?? parsed.data.amount);
  const feeMinor = toMinor(parsed.data.fee);

  return {
    settled: parsed.data.status === "SUCCESS",
    status: parsed.data.status,
    transactionId: parsed.data.transactionId ?? parsed.data.id ?? null,
    feeMinor,
    amountMinor: grossMinor,
  };
}

/**
 * Ask Nomba to re-push webhook events whose delivery to us failed or is
 * uncertain within a window. Nomba re-sends them — correctly signed — to our
 * registered webhook URL; our WebhookReceipt/business idempotency makes any
 * duplicate deliveries safe. This is the recovery backstop for missed webhooks
 * (e.g. our endpoint was briefly unreachable).
 *
 * `statuses` should stay to INITIATED / FAILED / INCONCLUSIVE — replaying
 * PUSHED would re-deliver already-successful events on every run. `eventTypes`
 * uses Nomba's UPPER_CASE filter names (the re-pushed webhook still arrives
 * with its lower-case `event_type`, which dispatch already handles). The
 * response is a fire-and-forget acknowledgement; Nomba re-delivers async.
 */
export async function replayWebhooks(params: {
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  statuses: string[];
  eventTypes: string[];
}): Promise<{ description: string }> {
  const res = await nombaFetch("/v1/webhooks/replay", {
    method: "POST",
    body: JSON.stringify({
      startDate: params.startDate,
      endDate: params.endDate,
      filter: { statuses: params.statuses, eventTypes: params.eventTypes },
    }),
  });

  if (!res.ok) {
    throw new Error(`Webhook replay failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return { description: typeof data?.description === "string" ? data.description : "" };
}

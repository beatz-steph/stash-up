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

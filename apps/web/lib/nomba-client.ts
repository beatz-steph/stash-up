import "server-only";

const BASE_URL = process.env.NOMBA_BASE_URL!;
const CLIENT_ID = process.env.NOMBA_CLIENT_ID!;
const CLIENT_SECRET = process.env.NOMBA_CLIENT_SECRET!;
// Parent account UUID — required header on every Nomba API call
const ACCOUNT_ID = process.env.NOMBA_ACCOUNT_ID!;
// Sub-account UUID — used as path param for sub-account scoped operations
const SUB_ACCOUNT_ID = process.env.NOMBA_SUB_ACCOUNT_ID!;

interface NombaToken {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

// In-memory token cache (process-scoped, resets on cold start)
let cachedToken: NombaToken | null = null;

async function fetchNewToken(): Promise<NombaToken> {
  const res = await fetch(`${BASE_URL}/v1/auth/token/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // accountId header is REQUIRED on every Nomba request including auth
      accountId: ACCOUNT_ID,
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Nomba auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    // Expires in 30 min — cache with 5 min buffer
    expires_at: Date.now() + 25 * 60 * 1000,
  };
}

async function refreshToken(refreshToken: string): Promise<NombaToken> {
  const res = await fetch(`${BASE_URL}/v1/auth/token/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accountId: ACCOUNT_ID,
      Authorization: `Bearer ${cachedToken?.access_token}`,
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    // Refresh failed — fall back to full re-auth
    return fetchNewToken();
  }

  const data = await res.json();
  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_at: Date.now() + 25 * 60 * 1000,
  };
}

async function getToken(): Promise<string> {
  if (!cachedToken) {
    cachedToken = await fetchNewToken();
    return cachedToken.access_token;
  }

  // Refresh if within 5 min of expiry
  if (Date.now() >= cachedToken.expires_at) {
    cachedToken = await refreshToken(cachedToken.refresh_token);
  }

  return cachedToken.access_token;
}

// Base fetch helper — always injects auth + accountId header
async function nombaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      accountId: ACCOUNT_ID,
      Authorization: token,
      ...(init.headers ?? {}),
    },
  });
}

// ─── Virtual Accounts ──────────────────────────────────────────────────────

interface CreateVirtualAccountParams {
  accountRef: string;      // our internal reference e.g. "membership_{membershipId}"
  accountName: string;     // display name for the VA
  bvn?: string;
}

export async function createVirtualAccount(params: CreateVirtualAccountParams) {
  // POST /v1/accounts/virtual/{subAccountId}
  // Funds received route into the sub-account
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
  return data.data as {
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
    accountRef: string;
  };
}

// ─── Transfers (Payouts) ───────────────────────────────────────────────────

interface BankTransferParams {
  amount: number;          // in NAIRA (not kobo) — divide kobo amount by 100
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration: string;
  merchantTxRef: string;   // idempotency key — use "payout_{cycleId}"
}

export async function initiateSubAccountBankTransfer(params: BankTransferParams) {
  // POST /v2/transfers/bank/{subAccountId}
  // NOTE: sub-account transfers must be enabled by Nomba for your account
  const res = await nombaFetch(`/v2/transfers/bank/${SUB_ACCOUNT_ID}`, {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      bankCode: params.bankCode,
      accountNumber: params.accountNumber,
      accountName: params.accountName,
      narration: params.narration,
      merchantTxRef: params.merchantTxRef,
    }),
  });

  if (!res.ok) {
    throw new Error(`Payout failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()).data;
}

// ─── Account Balance ───────────────────────────────────────────────────────

export async function getSubAccountBalance() {
  // GET /v1/accounts/{subAccountId}/balance
  const res = await nombaFetch(`/v1/accounts/${SUB_ACCOUNT_ID}/balance`);

  if (!res.ok) {
    throw new Error(`Fetch balance failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  // Return balance in kobo (multiply by 100 — Nomba returns naira)
  return {
    availableBalanceMinor: Math.round(data.data.availableBalance * 100),
    ledgerBalanceMinor: Math.round(data.data.ledgerBalance * 100),
  };
}

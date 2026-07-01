import "server-only";
import { redis } from "@/lib/redis";

const BASE_URL = process.env.NOMBA_BASE_URL!;
const CLIENT_ID = process.env.NOMBA_CLIENT_ID!;
const CLIENT_SECRET = process.env.NOMBA_CLIENT_SECRET!;
const ACCOUNT_ID = process.env.NOMBA_ACCOUNT_ID!;
const SUB_ACCOUNT_ID = process.env.NOMBA_SUB_ACCOUNT_ID!;

const TOKEN_KEY = "nomba:token";

interface NombaToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

let tokenPromise: Promise<NombaToken> | null = null;

async function fetchNewToken(): Promise<NombaToken> {
  const res = await fetch(`${BASE_URL}/v1/auth/token/issue`, {
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
  });

  if (!res.ok) {
    throw new Error(`Nomba auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const token: NombaToken = {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_at: Date.now() + 25 * 60 * 1000,
  };

  await redis.set(TOKEN_KEY, JSON.stringify(token), "EX", 26 * 60);
  return token;
}

async function doRefreshToken(token: NombaToken): Promise<NombaToken> {
  const res = await fetch(`${BASE_URL}/v1/auth/token/refresh`, {
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
  });

  if (!res.ok) {
    return fetchNewToken();
  }

  const data = await res.json();
  const refreshed: NombaToken = {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_at: Date.now() + 25 * 60 * 1000,
  };

  await redis.set(TOKEN_KEY, JSON.stringify(refreshed), "EX", 26 * 60);
  return refreshed;
}

async function getToken(): Promise<string> {
  // Deduplicate concurrent token requests
  if (tokenPromise) {
    return (await tokenPromise).access_token;
  }

  const raw = await redis.get(TOKEN_KEY);

  if (raw) {
    const token: NombaToken = JSON.parse(raw);
    if (Date.now() < token.expires_at) {
      return token.access_token;
    }
    
    tokenPromise = doRefreshToken(token).finally(() => {
      tokenPromise = null;
    });
    return (await tokenPromise).access_token;
  }

  tokenPromise = fetchNewToken().finally(() => {
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
  return data.data as {
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
    accountRef: string;
  };
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

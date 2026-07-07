import { NextResponse } from "next/server";
import { nombaFetch } from "@/lib/nomba-client";

export async function GET() {
  const qs = new URLSearchParams({ limit: "50" });
  const subAccountId = process.env.NOMBA_SUB_ACCOUNT_ID;
  const res = await nombaFetch(`/v1/transactions/accounts/${subAccountId}?${qs}`);
  const data = await res.json();
  
  return NextResponse.json(data);
}

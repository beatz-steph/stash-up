import { NextResponse } from "next/server"
import type { Bank } from "./dto/bank.dto"

// Static list of major Nigerian banks (reference data).
const BANKS: Bank[] = [
  { code: "058", name: "GTBank" },
  { code: "044", name: "Access Bank" },
  { code: "057", name: "Zenith Bank" },
  { code: "033", name: "United Bank for Africa (UBA)" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "090267", name: "Kuda Bank" },
  { code: "999992", name: "OPay" },
  { code: "999991", name: "PalmPay" },
  { code: "50515", name: "Moniepoint MFB" },
]

export async function GET() {
  return NextResponse.json(BANKS)
}

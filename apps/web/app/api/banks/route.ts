import { NextResponse } from "next/server"
import { getBanks } from "@/lib/nomba-client"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const banks = await getBanks()
    // Optional: Sort banks alphabetically by name for better UX
    banks.sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json(banks)
  } catch (error) {
    console.error("Failed to fetch banks:", error)
    return NextResponse.json({ error: "Failed to load banks" }, { status: 500 })
  }
}

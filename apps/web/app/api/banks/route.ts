import { getSession } from "@/lib/session"
import { NextResponse } from "next/server"
import { getBanks } from "@/lib/nomba-client"

export async function GET() {
  const session = await getSession()
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

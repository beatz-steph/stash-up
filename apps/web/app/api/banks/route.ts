import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"
import { getBanks } from "@/lib/nomba-client"
import type { Bank } from "./dto/bank.dto"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return apiError("Unauthorized", 401)
  }

  try {
    const banks = await getBanks()
    // Optional: Sort banks alphabetically by name for better UX
    banks.sort((a, b) => a.name.localeCompare(b.name))
    return apiSuccess<Bank[]>(banks)
  } catch (error) {
    console.error("Failed to fetch banks:", error)
    return apiError("Failed to load banks", 500)
  }
}

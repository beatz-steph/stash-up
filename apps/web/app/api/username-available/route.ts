import { apiSuccess, apiError } from "@/lib/api/response";
import { prisma } from "@workspace/db"

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,}$/

/**
 * GET /api/username-available?username=<handle>
 * Lightweight availability check used while the user fills the sign-up form,
 * so they don't hit a "username taken" error only at submit time.
 * Usernames are normalized to lowercase to match the BetterAuth username plugin.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get("username")?.trim() ?? ""
  const username = raw.toLowerCase()

  if (!USERNAME_PATTERN.test(username)) {
    return apiSuccess({ available: false, reason: "invalid" as const })
  }

  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  })

  return apiSuccess({ available: !existing })
}

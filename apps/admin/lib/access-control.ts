import { auth } from "./auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function requireAdmin() {
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { session, error: null }
}

export async function requireSuperAdmin() {
  const result = await requireAdmin()
  if (result.error) return result

  if (result.session.user.role !== "SUPER_ADMIN") {
    return { session: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { session: result.session, error: null }
}

import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/access-control"
import { recordAudit } from "@/lib/audit"
import { treasuryReconResSchema } from "./dto/treasury.dto"

// The web app owns the live Nomba balance, so the treasury reconciliation lives
// there (GET /api/cron/reconciliation). Admin has no Nomba client — it proxies
// to that endpoint with the shared CRON_SECRET and records who ran it.
const WEB_APP_URL = process.env.WEB_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

/**
 * Run treasury reconciliation on demand ("simulate") and return the report.
 * POST (not GET) because it's an operator-triggered action we audit. Any admin
 * may run it; the result is read-only (no money moves).
 */
export async function POST() {
  const { session, error } = await requireAdmin()
  if (error) return error

  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: "Reconciliation is not configured (missing CRON_SECRET)" },
      { status: 503 }
    )
  }

  let payload: unknown
  try {
    const res = await fetch(`${WEB_APP_URL}/api/cron/reconciliation`, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Reconciliation service returned ${res.status}` },
        { status: 502 }
      )
    }
    const body = await res.json()
    // The web endpoint wraps its result as { data: <report> } (apiSuccess).
    payload = body?.data ?? body
  } catch {
    return NextResponse.json(
      { error: "Could not reach the reconciliation service" },
      { status: 502 }
    )
  }

  const parsed = treasuryReconResSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Reconciliation service returned an unexpected response" },
      { status: 502 }
    )
  }

  await recordAudit({
    adminUserId: session.user.id,
    action: "RECONCILIATION_RUN",
    entityType: "Treasury",
    metadata: {
      status: parsed.data.status,
      driftMinor: parsed.data.nomba.driftMinor,
      stuckPayouts: parsed.data.attention.stuckPayouts,
      unmatchedInbound: parsed.data.attention.unmatchedInbound,
    },
  })

  return NextResponse.json(parsed.data)
}

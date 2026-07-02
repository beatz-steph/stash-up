"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { formatNaira } from "@/lib/money"
import type { CircleDetailRes } from "@/app/api/circles/dto/circles.dto"

type Cycle = NonNullable<CircleDetailRes["cycles"]>[number]
type Member = CircleDetailRes["members"][number]

function statusClass(status: string): string {
  if (status === "PAID_OUT") return "bg-su-semantic-up/10 text-su-semantic-up"
  if (status === "CANCELLED") return "bg-su-semantic-down/10 text-su-semantic-down"
  if (status === "OPEN" || status === "COLLECTING") return "bg-su-accent-yellow/10 text-su-accent-yellow"
  return "bg-su-surface-strong text-su-muted"
}

export function CycleHistory({
  cycles,
  members,
}: {
  cycles: Cycle[]
  members: Member[]
}) {
  if (cycles.length === 0) return null

  const recipientName = (membershipId: string) =>
    members.find((m) => m.id === membershipId)?.user.name ?? "—"

  // Newest first.
  const ordered = [...cycles].sort((a, b) => b.sequence - a.sequence)

  return (
    <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
      <CardHeader>
        <CardTitle className="font-su-sans text-su-title-sm">Cycle history</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-su-hairline-soft">
          {ordered.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                  Cycle {c.sequence} · {recipientName(c.recipientMembershipId)}
                </p>
                <p className="font-su-sans text-su-caption text-su-muted">
                  {c.paidOutAt
                    ? `Paid ${new Date(c.paidOutAt).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : "Not yet paid out"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-su-mono text-su-caption text-su-muted [font-feature-settings:'tnum']">
                  {formatNaira(c.potCollectedMinor)} / {formatNaira(c.potExpectedMinor)}
                </span>
                <Badge className={`rounded-su-pill ${statusClass(c.status)}`}>{c.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

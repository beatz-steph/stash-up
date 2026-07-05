"use client"

import { formatNaira } from "@/lib/money"
import type { CircleDetailRes } from "@/app/api/circles/dto/circles.dto"

type Cycle = NonNullable<CircleDetailRes["cycles"]>[number]
type Member = CircleDetailRes["members"][number]

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Collecting",
  COLLECTING: "Collecting",
  AWAITING_RESOLUTION: "Needs attention",
  READY_TO_PAYOUT: "Ready to pay out",
  PAYOUT_INITIATED: "Payout on the way",
  PAID_OUT: "Paid out",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
}

function statusClass(status: string): string {
  if (status === "PAID_OUT") return "text-su-semantic-up"
  if (status === "CANCELLED") return "text-su-semantic-down"
  if (status === "OPEN" || status === "COLLECTING") return "text-su-accent-yellow"
  return "text-su-muted"
}

/** Past cycles as a quiet, flat section — matches the circle-detail page's
 * typography-led layout (eyebrow label + divided list, no card box). */
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
    <section>
      <h2 className="font-su-sans text-su-caption-sm font-semibold uppercase tracking-wider text-su-muted">
        Cycle history
      </h2>
      <ul className="mt-3 divide-y divide-su-hairline-soft">
        {ordered.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-su-sans text-su-body-sm font-semibold text-su-ink">
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
            <div className="shrink-0 text-right">
              <p className="font-su-mono text-su-caption text-su-muted [font-feature-settings:'tnum']">
                {formatNaira(c.potCollectedMinor)} / {formatNaira(c.potExpectedMinor)}
              </p>
              <p className={`font-su-sans text-su-caption-sm font-semibold ${statusClass(c.status)}`}>
                {STATUS_LABEL[c.status] ?? c.status}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

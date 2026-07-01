"use client"

import Link from "next/link"
import { Users } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Progress } from "@workspace/ui/components/progress"
import { formatNaira } from "@/lib/money"

export interface CircleCardData {
  id: string
  name: string
  contributionMinor: number
  frequency: string
  status: string
  totalSlots: number
  filledSlots: number
}

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "weekly",
  BIWEEKLY: "bi-weekly",
  MONTHLY: "monthly",
}

export function CircleCard({ circle }: { circle: CircleCardData }) {
  const pct = Math.round((circle.filledSlots / circle.totalSlots) * 100)
  const isForming = circle.status === "FORMING"

  return (
    <Link
      href={`/circles/${circle.id}`}
      className="group flex h-full flex-col justify-between gap-5 rounded-su-xl border border-su-hairline bg-su-surface-card p-su-lg transition-colors hover:border-su-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-su-sans text-su-title-sm font-semibold text-su-ink">
            {circle.name}
          </h3>
          <p className="font-su-sans text-su-caption text-su-muted">
            {FREQUENCY_LABEL[circle.frequency] ?? circle.frequency.toLowerCase()} contribution
          </p>
        </div>
        <Badge
          className={
            isForming
              ? "rounded-su-pill bg-su-accent-yellow/10 text-su-accent-yellow"
              : "rounded-su-pill bg-su-semantic-up/10 text-su-semantic-up"
          }
        >
          {circle.status}
        </Badge>
      </div>

      <p className="font-su-mono text-su-title-md font-medium text-su-ink [font-feature-settings:'tnum']">
        {formatNaira(circle.contributionMinor)}
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between font-su-sans text-su-caption text-su-muted">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Members
          </span>
          <span className="font-su-mono [font-feature-settings:'tnum']">
            {circle.filledSlots} / {circle.totalSlots}
          </span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
    </Link>
  )
}

"use client"

import Link from "next/link"
import { ArrowRight, Inbox, Layers, Plus, Sparkles, Wallet } from "lucide-react"
import { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useMyCircles, useMyInvites } from "../queries"
import { CircleCard } from "./circle-card"
import { formatNaira } from "@/lib/money"
import { useIsOnboarded } from "@/features/onboarding/components/onboarding-provider"

function StatCard({
  label,
  value,
  icon,
  mono = true,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  mono?: boolean
}) {
  return (
    <div className="rounded-su-xl border border-su-hairline bg-su-surface-card p-su-lg">
      <div className="flex items-center gap-2 text-su-muted">
        {icon}
        <span className="font-su-sans text-su-caption font-medium">{label}</span>
      </div>
      <p
        className={`mt-3 text-su-title-lg font-semibold text-su-ink ${
          mono
            ? "font-su-mono [font-feature-settings:'tnum']"
            : "font-su-display tracking-su-title-lg"
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export function DashboardOverview() {
  const { data: circles, isLoading } = useMyCircles()
  const { data: invites } = useMyInvites()
  const isOnboarded = useIsOnboarded()

  const pendingInvites = invites?.filter((i) => i.status === "PENDING") ?? []
  const active = circles?.filter((c) => c.status === "ACTIVE") ?? []
  const forming = circles?.filter((c) => c.status === "FORMING") ?? []
  const perCycle = (circles ?? []).reduce((sum, c) => sum + c.contributionMinor, 0)
  const recent = (circles ?? []).slice(0, 6)

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-su-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-su-xl" />
          ))}
        </div>
      </div>
    )
  }

  const content = (
    <div className="space-y-8">
      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active circles"
          value={active.length}
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard
          label="Forming"
          value={forming.length}
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="Pending invites"
          value={pendingInvites.length}
          icon={<Inbox className="h-4 w-4" />}
        />
        <StatCard
          label="Per-cycle total"
          value={formatNaira(perCycle)}
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      {/* Pending invites nudge */}
      {pendingInvites.length > 0 && (
        <Link
          href="/invites"
          className="flex items-center justify-between gap-4 rounded-su-xl border border-su-primary/30 bg-su-primary/5 p-su-base transition-colors hover:bg-su-primary/10"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-su-full bg-su-primary/15 text-su-primary">
              <Inbox className="h-5 w-5" />
            </span>
            <div>
              <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                You have {pendingInvites.length} pending invite
                {pendingInvites.length > 1 ? "s" : ""}
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">
                Review and respond to your circle invitations.
              </p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-su-primary" />
        </Link>
      )}

      {/* Circles */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-su-sans text-su-title-sm font-semibold text-su-ink">
            Your circles
          </h2>
          {recent.length > 0 && (
            <Button asChild variant="ghost" size="sm" className="text-su-muted">
              <Link href="/circles">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-su-xl border border-dashed border-su-hairline bg-su-surface-soft px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-su-full bg-su-surface-strong text-su-muted">
              <Layers className="h-6 w-6" />
            </span>
            <div className="space-y-1">
              <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                No circles yet
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">
                Create your first rotating savings circle to get started.
              </p>
            </div>
            <Button asChild className="rounded-su-pill">
              <Link href="/circles/new">
                <Plus className="mr-2 h-4 w-4" />
                Create a circle
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {recent.map((circle) => (
              <CircleCard key={circle.id} circle={circle} />
            ))}
          </div>
        )}
      </section>
    </div>
  )

  return !isOnboarded ? (
    <div className="relative">
      <div className="blur-md pointer-events-none select-none opacity-50 transition-all duration-300">
        {content}
      </div>
      <div className="absolute inset-0 z-10" />
    </div>
  ) : content
}

"use client"

import Link from "next/link"
import { useMyCircles } from "../queries"
import { Layers, Plus } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { CircleCard } from "./circle-card"

export function CirclesList() {
  const { data: circles, isLoading, error } = useMyCircles()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-su-xl" />
        ))}
      </div>
    )
  }

  if (error || !circles) {
    return (
      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card p-8 text-center font-su-sans text-su-body-sm text-su-semantic-down">
        Failed to load circles.
      </div>
    )
  }

  if (circles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-su-xl border border-dashed border-su-hairline bg-su-surface-soft px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-su-full bg-su-surface-strong text-su-muted">
          <Layers className="h-6 w-6" />
        </span>
        <div className="space-y-1">
          <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
            You&apos;re not in any circles yet
          </p>
          <p className="font-su-sans text-su-caption text-su-muted">
            Create one and invite your friends to start saving together.
          </p>
        </div>
        <Button asChild className="rounded-su-pill">
          <Link href="/circles/new">
            <Plus className="mr-2 h-4 w-4" />
            Create a circle
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {circles.map((circle) => (
        <CircleCard key={circle.id} circle={circle} />
      ))}
    </div>
  )
}

"use client"

import Link from "next/link"
import { useMyCircles } from "../queries"
import { Loader2, Plus } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"

export function CirclesList() {
  const { data: circles, isLoading, error } = useMyCircles()

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-su-muted h-8 w-8" /></div>
  }

  if (error || !circles) {
    return <div className="text-red-500">Failed to load circles</div>
  }

  if (circles.length === 0) {
    return (
      <Card className="bg-su-surface-card border border-su-hairline rounded-su-xl p-su-base">
        <CardContent className="pt-6 text-center py-12 space-y-4">
          <p className="text-su-muted">You are not in any circles yet.</p>
          <Button asChild>
            <Link href="/circles/new">
              <Plus className="mr-2 h-4 w-4" />
              Create a Circle
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/circles/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Circle
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {circles.map((circle) => (
          <Link href={`/circles/${circle.id}`} key={circle.id} className="block transition-transform hover:-translate-y-1">
            <Card className="h-full bg-su-surface-card border border-su-hairline rounded-su-xl hover:border-su-primary transition-colors cursor-pointer">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="font-su-sans text-su-title-sm line-clamp-1">{circle.name}</CardTitle>
                  <Badge variant={circle.status === "FORMING" ? "default" : "secondary"}>
                    {circle.status}
                  </Badge>
                </div>
                <CardDescription>
                  {circle.frequency} contribution
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-su-title-md font-semibold font-su-display">
                    {circle.currency}{(circle.contributionMinor / 100).toFixed(2)}
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-su-muted">
                      <span>Members</span>
                      <span>{circle.filledSlots} / {circle.totalSlots}</span>
                    </div>
                    <div className="w-full bg-su-hairline-soft h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-su-primary h-full" 
                        style={{ width: `${(circle.filledSlots / circle.totalSlots) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

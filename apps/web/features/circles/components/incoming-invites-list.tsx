"use client"

import { useState } from "react"
import { useMyInvites } from "../queries"
import { useAcceptInvite, useDeclineInvite } from "../mutations"
import { Inbox, Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/sonner"
import { formatNaira } from "@/lib/money"

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "weekly",
  BIWEEKLY: "bi-weekly",
  MONTHLY: "monthly",
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function IncomingInvitesList() {
  const { data: invites, isLoading, error } = useMyInvites()
  const { mutate: acceptInvite } = useAcceptInvite()
  const { mutate: declineInvite } = useDeclineInvite()
  const [processingId, setProcessingId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-su-xl" />
        ))}
      </div>
    )
  }

  if (error || !invites) {
    return (
      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card p-8 text-center font-su-sans text-su-body-sm text-su-semantic-down">
        Failed to load invites.
      </div>
    )
  }

  const pendingInvites = invites.filter((i) => i.status === "PENDING")

  if (pendingInvites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-su-xl border border-dashed border-su-hairline bg-su-surface-soft px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-su-full bg-su-surface-strong text-su-muted">
          <Inbox className="h-6 w-6" />
        </span>
        <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
          No pending invites
        </p>
        <p className="font-su-sans text-su-caption text-su-muted">
          When someone invites you to a circle, it'll show up here.
        </p>
      </div>
    )
  }

  const handleAccept = (id: string, name: string) => {
    setProcessingId(id)
    acceptInvite(id, {
      onSuccess: () => toast.success(`You joined ${name}`),
      onError: (err) => toast.error(err.message || "Failed to accept invite"),
      onSettled: () => setProcessingId(null),
    })
  }

  const handleDecline = (id: string) => {
    setProcessingId(id)
    declineInvite(id, {
      onSuccess: () => toast.success("Invite declined"),
      onError: (err) => toast.error(err.message || "Failed to decline invite"),
      onSettled: () => setProcessingId(null),
    })
  }

  return (
    <div className="space-y-4">
      {pendingInvites.map((invite) => {
        const isExpired = new Date(invite.expiresAt) < new Date()
        const busy = processingId === invite.id

        return (
          <div
            key={invite.id}
            className="flex flex-col gap-4 rounded-su-xl border border-su-hairline bg-su-surface-card p-su-lg md:flex-row md:items-center md:justify-between"
          >
            <div className="flex items-start gap-4">
              <Avatar className="h-11 w-11">
                <AvatarFallback className="bg-su-surface-strong font-su-sans text-su-body-sm font-semibold text-su-ink">
                  {initials(invite.circle.name)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-su-sans text-su-title-sm font-semibold text-su-ink">
                    {invite.circle.name}
                  </h3>
                  {isExpired && (
                    <Badge className="rounded-su-pill bg-su-semantic-down/10 text-su-semantic-down">
                      Expired
                    </Badge>
                  )}
                </div>
                <p className="font-su-sans text-su-caption text-su-muted">
                  Invited by{" "}
                  <span className="font-su-mono text-su-ink">@{invite.invitedBy.username}</span>
                </p>
                <p className="font-su-sans text-su-caption text-su-muted">
                  <span className="font-su-mono text-su-ink [font-feature-settings:'tnum']">
                    {formatNaira(invite.circle.contributionMinor)}
                  </span>{" "}
                  {FREQUENCY_LABEL[invite.circle.frequency] ?? invite.circle.frequency.toLowerCase()} ·
                  expires {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 md:w-auto">
              <Button
                variant="outline"
                className="flex-1 rounded-su-pill md:flex-none"
                onClick={() => handleDecline(invite.id)}
                disabled={busy}
              >
                Decline
              </Button>
              <Button
                className="flex-1 rounded-su-pill md:flex-none"
                onClick={() => handleAccept(invite.id, invite.circle.name)}
                disabled={busy || isExpired}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Accept
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

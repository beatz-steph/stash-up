"use client"

import { useState } from "react"
import { useMyInvites } from "../queries"
import { useAcceptInvite, useDeclineInvite } from "../mutations"
import { Loader2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"

export function IncomingInvitesList() {
  const { data: invites, isLoading, error } = useMyInvites()
  const { mutate: acceptInvite, isPending: isAccepting } = useAcceptInvite()
  const { mutate: declineInvite, isPending: isDeclining } = useDeclineInvite()
  const [errorMap, setErrorMap] = useState<Record<string, string>>({})
  const [processingId, setProcessingId] = useState<string | null>(null)

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-su-muted h-8 w-8" /></div>
  }

  if (error || !invites) {
    return <div className="text-red-500">Failed to load invites</div>
  }

  const pendingInvites = invites.filter(i => i.status === "PENDING")

  if (pendingInvites.length === 0) {
    return (
      <Card className="bg-su-surface-card border border-su-hairline rounded-su-xl p-su-base">
        <CardContent className="pt-6 text-center py-12">
          <p className="text-su-muted">You have no pending invites.</p>
        </CardContent>
      </Card>
    )
  }

  const handleAccept = (id: string) => {
    setProcessingId(id)
    setErrorMap(prev => ({ ...prev, [id]: "" }))
    
    acceptInvite(id, {
      onSettled: () => setProcessingId(null),
      onError: (err) => {
        setErrorMap(prev => ({ ...prev, [id]: err.message || "Failed to accept invite" }))
      }
    })
  }

  const handleDecline = (id: string) => {
    setProcessingId(id)
    
    declineInvite(id, {
      onSettled: () => setProcessingId(null),
    })
  }

  return (
    <div className="space-y-4">
      {pendingInvites.map((invite) => {
        const isExpired = new Date(invite.expiresAt) < new Date()
        
        return (
          <Card key={invite.id} className="bg-su-surface-card border border-su-hairline rounded-su-xl">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    {invite.circle.name}
                    {isExpired && <Badge variant="destructive">Expired</Badge>}
                  </h3>
                  <p className="text-su-muted text-sm">
                    Invited by <span className="font-medium text-su-ink">@{invite.invitedBy.username}</span>
                  </p>
                  <p className="text-su-muted text-sm">
                    Contribution: ₦{(invite.circle.contributionMinor / 100).toFixed(2)} {invite.circle.frequency}
                  </p>
                  <p className="text-su-muted text-xs">
                    Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <Button 
                    variant="outline" 
                    onClick={() => handleDecline(invite.id)}
                    disabled={isDeclining || processingId === invite.id}
                    className="flex-1 md:flex-none"
                  >
                    Decline
                  </Button>
                  <Button 
                    onClick={() => handleAccept(invite.id)}
                    disabled={isAccepting || isExpired || processingId === invite.id}
                    className="flex-1 md:flex-none"
                  >
                    {processingId === invite.id && isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Accept
                  </Button>
                </div>
              </div>
              
              {errorMap[invite.id] && (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{errorMap[invite.id]}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

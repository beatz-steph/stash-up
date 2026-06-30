"use client"

import { useCircleDetail } from "../queries"
import { useCancelCircle, useLeaveCircle, useCancelInvite } from "../mutations"
import { InviteMemberForm } from "./invite-member-form"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export function CircleDetail({ circleId }: { circleId: string }) {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const { data: circle, isLoading, error } = useCircleDetail(circleId)
  
  const { mutate: cancelCircle, isPending: isCancellingCircle } = useCancelCircle()
  const { mutate: leaveCircle, isPending: isLeavingCircle } = useLeaveCircle()
  const { mutate: cancelInvite, isPending: isCancellingInvite } = useCancelInvite(circleId)

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-su-muted h-8 w-8" /></div>
  }

  if (error || !circle) {
    return <div className="p-8 text-center text-red-500">Failed to load circle details</div>
  }

  const myMembership = circle.members.find(m => m.user.id === session?.user?.id)
  const isCreator = myMembership?.role === "CREATOR"
  const isForming = circle.status === "FORMING"
  
  // Calculate slots filled (active members + pending invites)
  const activeMembersCount = circle.members.length
  const pendingInvitesCount = circle.invites.filter(i => i.status === "PENDING").length
  const slotsFilled = activeMembersCount + pendingInvitesCount

  return (
    <div className="space-y-8">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink flex items-center gap-3">
            {circle.name}
            <Badge variant={isForming ? "default" : "secondary"}>{circle.status}</Badge>
          </h1>
          <p className="font-su-sans text-su-body-sm text-su-muted mt-1">
            {circle.frequency} contribution of {circle.currency}{(circle.contributionMinor / 100).toFixed(2)}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {isCreator && isForming && (
            <Button 
              variant="destructive" 
              onClick={() => {
                if (confirm("Are you sure you want to cancel this circle?")) {
                  cancelCircle(circle.id, {
                    onSuccess: () => router.push("/")
                  })
                }
              }}
              disabled={isCancellingCircle}
            >
              Cancel Circle
            </Button>
          )}
          
          {!isCreator && isForming && (
            <Button 
              variant="outline" 
              onClick={() => {
                if (confirm("Are you sure you want to leave this circle?")) {
                  leaveCircle(circle.id, {
                    onSuccess: () => router.push("/")
                  })
                }
              }}
              disabled={isLeavingCircle}
            >
              Leave Circle
            </Button>
          )}
        </div>
      </div>

      {/* Members & Invites Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-8">
          {/* Members Table */}
          <Card className="bg-su-surface-card border border-su-hairline rounded-su-xl">
            <CardHeader>
              <CardTitle className="font-su-sans text-su-title-sm">Members ({activeMembersCount}/{circle.totalSlots})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Position</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {circle.members.map((member) => (
                    <TableRow key={member.user.id}>
                      <TableCell className="font-medium">{member.payoutPosition}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{member.user.name}</span>
                          <span className="text-su-muted text-xs">@{member.user.username}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.role}</Badge>
                      </TableCell>
                      <TableCell>{member.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pending Invites Table */}
          {circle.invites.length > 0 && (
            <Card className="bg-su-surface-card border border-su-hairline rounded-su-xl">
              <CardHeader>
                <CardTitle className="font-su-sans text-su-title-sm">Invites</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      {isCreator && isForming && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {circle.invites.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{invite.invitedUser.name}</span>
                            <span className="text-su-muted text-xs">@{invite.invitedUser.username}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={invite.status === "PENDING" ? "default" : "secondary"}>
                            {invite.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(invite.expiresAt).toLocaleDateString()}
                        </TableCell>
                        {isCreator && isForming && (
                          <TableCell className="text-right">
                            {invite.status === "PENDING" && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => cancelInvite(invite.id)}
                                disabled={isCancellingInvite}
                              >
                                Cancel
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar details */}
        <div className="space-y-6">
          <Card className="bg-su-surface-card border border-su-hairline rounded-su-xl">
            <CardHeader>
              <CardTitle className="font-su-sans text-su-title-sm">Circle Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Slots Filled</span>
                  <span>{slotsFilled} / {circle.totalSlots}</span>
                </div>
                <div className="w-full bg-su-hairline-soft h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-su-primary h-full transition-all" 
                    style={{ width: `${(slotsFilled / circle.totalSlots) * 100}%` }}
                  />
                </div>
              </div>
              
              {isCreator && isForming && slotsFilled < circle.totalSlots && (
                <div className="pt-4 border-t border-su-hairline-soft">
                  <InviteMemberForm circleId={circle.id} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}

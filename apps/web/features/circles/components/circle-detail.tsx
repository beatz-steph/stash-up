"use client"

import { useCircleDetail } from "../queries"
import { useCancelCircle, useLeaveCircle, useCancelInvite } from "../mutations"
import { InviteMemberDialog } from "./invite-member-form"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Progress } from "@workspace/ui/components/progress"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { toast } from "@workspace/ui/components/sonner"
import { formatNaira } from "@/lib/money"

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  MONTHLY: "Monthly",
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function CircleDetail({ circleId }: { circleId: string }) {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const { data: circle, isLoading, error } = useCircleDetail(circleId)

  const { mutate: cancelCircle, isPending: isCancellingCircle } = useCancelCircle()
  const { mutate: leaveCircle, isPending: isLeavingCircle } = useLeaveCircle()
  const { mutate: cancelInvite, isPending: isCancellingInvite } = useCancelInvite(circleId)

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-su-muted" />
      </div>
    )
  }

  if (error || !circle) {
    return (
      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card p-8 text-center font-su-sans text-su-body-sm text-su-semantic-down">
        Failed to load circle details.
      </div>
    )
  }

  const myMembership = circle.members.find((m) => m.user.id === session?.user?.id)
  const isCreator = myMembership?.role === "CREATOR"
  const isForming = circle.status === "FORMING"

  const activeMembersCount = circle.members.length
  const pendingInvitesCount = circle.invites.filter((i) => i.status === "PENDING").length
  const slotsFilled = activeMembersCount + pendingInvitesCount
  const pct = Math.round((slotsFilled / circle.totalSlots) * 100)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="font-su-display text-su-title-lg font-semibold tracking-su-title-lg text-su-ink">
              {circle.name}
            </h1>
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
          <p className="font-su-sans text-su-body-sm text-su-muted">
            {FREQUENCY_LABEL[circle.frequency] ?? circle.frequency} contribution of{" "}
            <span className="font-su-mono text-su-ink [font-feature-settings:'tnum']">
              {formatNaira(circle.contributionMinor)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isCreator && isForming && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="rounded-su-pill" disabled={isCancellingCircle}>
                  Cancel circle
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this circle?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently cancels {circle.name} and removes all members and
                    pending invites. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep circle</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      cancelCircle(circle.id, {
                        onSuccess: () => {
                          toast.success("Circle cancelled")
                          router.push("/circles")
                        },
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    Cancel circle
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {!isCreator && isForming && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="rounded-su-pill" disabled={isLeavingCircle}>
                  Leave circle
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave this circle?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You&apos;ll give up your slot in {circle.name}. You can only rejoin if the
                    creator invites you again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Stay</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      leaveCircle(circle.id, {
                        onSuccess: () => {
                          toast.success("You left the circle")
                          router.push("/circles")
                        },
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    Leave circle
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left: members + invites */}
        <div className="space-y-8 lg:col-span-2">
          <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
            <CardHeader>
              <CardTitle className="font-su-sans text-su-title-sm">
                Members ({activeMembersCount}/{circle.totalSlots})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Slot</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {circle.members.map((member) => (
                    <TableRow key={member.user.id}>
                      <TableCell className="font-su-mono font-medium text-su-ink [font-feature-settings:'tnum']">
                        {member.payoutPosition}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-su-surface-strong font-su-sans text-su-caption-sm font-semibold text-su-ink">
                              {initials(member.user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                              {member.user.name}
                            </span>
                            <span className="font-su-mono text-su-caption-sm text-su-muted">
                              @{member.user.username}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-su-pill">
                          {member.role}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {pendingInvitesCount > 0 && (
            <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
              <CardHeader>
                <CardTitle className="font-su-sans text-su-title-sm">
                  Pending invites ({pendingInvitesCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invited</TableHead>
                      <TableHead>Expires</TableHead>
                      {isCreator && isForming && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {circle.invites
                      .filter((i) => i.status === "PENDING")
                      .map((invite) => (
                        <TableRow key={invite.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-su-surface-strong font-su-sans text-su-caption-sm font-semibold text-su-ink">
                                  {initials(invite.invitedUser.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                                  {invite.invitedUser.name}
                                </span>
                                <span className="font-su-mono text-su-caption-sm text-su-muted">
                                  @{invite.invitedUser.username}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-su-sans text-su-caption text-su-muted">
                            {new Date(invite.expiresAt).toLocaleDateString()}
                          </TableCell>
                          {isCreator && isForming && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-su-semantic-down hover:text-su-semantic-down"
                                onClick={() =>
                                  cancelInvite(invite.id, {
                                    onSuccess: () => toast.success("Invite cancelled"),
                                    onError: (e) => toast.error(e.message),
                                  })
                                }
                                disabled={isCancellingInvite}
                              >
                                Cancel
                              </Button>
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

        {/* Right: status + invite */}
        <div className="space-y-6">
          <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
            <CardHeader>
              <CardTitle className="font-su-sans text-su-title-sm">Circle status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between font-su-sans text-su-caption text-su-muted">
                  <span>Slots filled</span>
                  <span className="font-su-mono text-su-ink [font-feature-settings:'tnum']">
                    {slotsFilled} / {circle.totalSlots}
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>

              {isCreator && isForming && slotsFilled < circle.totalSlots && (
                <div className="border-t border-su-hairline-soft pt-5">
                  <InviteMemberDialog circleId={circle.id} />
                </div>
              )}

              {isCreator && isForming && slotsFilled >= circle.totalSlots && (
                <p className="rounded-su-md bg-su-surface-soft px-3 py-2 text-center font-su-sans text-su-caption text-su-muted">
                  All slots are filled.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

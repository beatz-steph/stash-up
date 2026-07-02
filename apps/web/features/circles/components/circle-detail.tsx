"use client"

import { useCircleDetail, useVirtualAccount } from "../queries"
import { useCancelCircle, useLeaveCircle, useCancelInvite, useActivateCircle, useRetryProvisioning, useTriggerPayout } from "../mutations"
import { InviteMemberDialog } from "./invite-member-form"
import { CycleHistory } from "./cycle-history"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Loader2, Copy } from "lucide-react"

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
  const { mutate: activateCircle, isPending: isActivating } = useActivateCircle(circleId)
  const { mutate: retryProvisioning, isPending: isRetrying } = useRetryProvisioning(circleId)
  const { mutate: triggerPayout, isPending: isTriggeringPayout } = useTriggerPayout(circleId)
  
  const { data: vaData } = useVirtualAccount(circleId)

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

  const activeMembersCount = circle.members.filter(m => m.status === "ACTIVE").length
  const pendingInvitesCount = circle.invites.filter((i) => i.status === "PENDING").length
  const slotsFilled = activeMembersCount + pendingInvitesCount
  const pct = Math.round((slotsFilled / circle.totalSlots) * 100)

  const hasFailedProvisioning = circle.members.some(m => m.vaProvisionStatus === "FAILED")
  const isFullAndActive = activeMembersCount === circle.totalSlots

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: funding + members + invites */}
        <div className="space-y-6 lg:col-span-2">
          {!isForming && vaData?.virtualAccount && (
            <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="font-su-sans text-su-title-sm">Fund your circle</CardTitle>
                  <Badge className="rounded-su-pill bg-su-primary/10 text-su-primary">
                    {formatNaira(circle.contributionMinor)} due
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-su-sans text-su-caption text-su-muted">
                  Transfer your contribution to this dedicated account — it&apos;s matched to your
                  circle automatically.
                </p>
                <div className="rounded-su-lg border border-su-hairline bg-su-surface p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                        Account number
                      </span>
                      <p className="font-su-mono text-su-title-md font-semibold text-su-ink [font-feature-settings:'tnum']">
                        {vaData.virtualAccount.bankAccountNumber}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-su-pill"
                      onClick={() => {
                        navigator.clipboard.writeText(vaData.virtualAccount!.bankAccountNumber)
                        toast.success("Account number copied")
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-su-hairline-soft pt-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                        Bank name
                      </span>
                      <p className="font-su-sans text-su-body-sm text-su-ink">
                        {vaData.virtualAccount.bankName}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                        Account name
                      </span>
                      <p className="font-su-sans text-su-body-sm text-su-ink">
                        {vaData.virtualAccount.bankAccountName}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                    {!isForming && <TableHead>Contribution</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {circle.members.map((member) => {
                    const contribution = circle.contributions?.find(c => c.membershipId === member.id);
                    const contribStatus = contribution?.status || "PENDING";
                    const statusColor = {
                      PENDING: "bg-su-accent-yellow/10 text-su-accent-yellow",
                      PARTIAL: "bg-su-accent-yellow/10 text-su-accent-yellow",
                      COMPLETE: "bg-su-semantic-up/10 text-su-semantic-up",
                      DEFAULTED: "bg-su-semantic-down/10 text-su-semantic-down"
                    }[contribStatus] || "bg-su-muted/10 text-su-muted";

                    return (
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
                      {!isForming && (
                        <TableCell>
                          <Badge className={`rounded-su-pill ${statusColor}`}>
                            {contribStatus}
                          </Badge>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
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

              {circle.currentCycle && (
                <div className="border-t border-su-hairline-soft pt-5 space-y-4">
                  <h3 className="font-su-sans text-su-caption-sm font-semibold text-su-ink uppercase tracking-wider">
                    Cycle {circle.currentCycle.sequence} Progress
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between font-su-sans text-su-caption text-su-muted">
                      <span>Pot Collected</span>
                      <span className="font-su-mono text-su-ink [font-feature-settings:'tnum']">
                        {formatNaira(circle.currentCycle.potCollectedMinor)} / {formatNaira(circle.currentCycle.potExpectedMinor)}
                      </span>
                    </div>
                    <Progress value={Math.round((circle.currentCycle.potCollectedMinor / circle.currentCycle.potExpectedMinor) * 100)} className="h-2" />
                    <div className="flex justify-between font-su-sans text-su-caption text-su-muted pt-1">
                      <span>Status: {circle.currentCycle.status}</span>
                      <span>Due: {new Date(circle.currentCycle.deadline).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {(() => {
                    const recipient = circle.members.find(m => m.id === circle.currentCycle?.recipientMembershipId);
                    const isMyTurn = recipient?.user.id === session?.user?.id;
                    const payoutStatus = circle.currentCycle?.payout?.status || "PENDING";
                    const payoutStatusColor = {
                      PENDING: "text-su-muted",
                      INITIATED: "text-su-accent-yellow",
                      SUCCESS: "text-su-semantic-up",
                      FAILED: "text-su-semantic-down"
                    }[payoutStatus] || "text-su-muted";

                    return (
                      <div className="rounded-su-lg bg-su-surface p-4 space-y-3 border border-su-hairline mt-4">
                        <div className="flex justify-between items-center">
                          <span className="font-su-sans text-su-caption text-su-muted">Recipient</span>
                          <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                            {isMyTurn ? "You" : recipient?.user.name}
                          </span>
                        </div>
                        {circle.currentCycle?.status === "PAYOUT_INITIATED" || circle.currentCycle?.status === "PAID_OUT" ? (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="font-su-sans text-su-caption text-su-muted">Payout Status</span>
                              <span className={`font-su-sans text-su-caption font-semibold ${payoutStatusColor}`}>
                                {payoutStatus}
                              </span>
                            </div>
                            {circle.currentCycle.payout?.failureReason && (
                              <p className="font-su-sans text-su-caption text-su-semantic-down">
                                {circle.currentCycle.payout.failureReason}
                              </p>
                            )}
                          </>
                        ) : null}

                        {isCreator && circle.currentCycle?.status === "READY_TO_PAYOUT" && (
                          <Button 
                            className="w-full rounded-su-pill mt-2" 
                            onClick={() => triggerPayout(circle.currentCycle!.id)}
                            disabled={isTriggeringPayout}
                          >
                            {isTriggeringPayout ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Trigger Payout
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

            </CardContent>
          </Card>

          {isCreator && isForming && (activeMembersCount < circle.totalSlots || isFullAndActive) && (
            <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
              <CardHeader>
                <CardTitle className="font-su-sans text-su-title-sm">Manage circle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeMembersCount < circle.totalSlots && (
                  <InviteMemberDialog circleId={circle.id} />
                )}

                {isFullAndActive && (
                  <>
                    <p className="font-su-sans text-su-caption text-su-muted">
                      All slots are filled with active members. Activate the circle to generate
                      funding accounts.
                    </p>
                    <Button
                      className="w-full rounded-su-pill"
                      onClick={() => activateCircle()}
                      disabled={isActivating || isRetrying}
                    >
                      {isActivating || isRetrying ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Activate Circle
                    </Button>
                    {hasFailedProvisioning && (
                      <Button
                        variant="outline"
                        className="w-full rounded-su-pill text-su-semantic-down"
                        onClick={() => retryProvisioning()}
                        disabled={isActivating || isRetrying}
                      >
                        Retry Failed Accounts
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {circle.cycles && circle.cycles.length > 0 && (
        <CycleHistory cycles={circle.cycles} members={circle.members} />
      )}
    </div>
  )
}

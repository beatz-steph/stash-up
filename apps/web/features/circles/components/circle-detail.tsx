"use client"

import { useCircleDetail, useVirtualAccount } from "../queries"
import { useCancelCircle, useLeaveCircle, useCancelInvite, useActivateCircle, useRetryProvisioning, useTriggerPayout, useRenewCircle } from "../mutations"
import { InviteMemberDialog } from "./invite-member-form"
import { CycleHistory } from "./cycle-history"
import { AutoSaveBlock } from "@/features/cards/components/auto-save-block"
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
  const { mutate: renewCircle, isPending: isRenewing } = useRenewCircle(circleId)
  
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
  const isCompleted = circle.status === "COMPLETED"
  const isActive = circle.status === "ACTIVE"

  const activeMembersCount = circle.members.filter(m => m.status === "ACTIVE").length
  const pendingInvitesCount = circle.invites.filter((i) => i.status === "PENDING").length
  const slotsFilled = activeMembersCount + pendingInvitesCount
  const pct = Math.round((slotsFilled / circle.totalSlots) * 100)

  const hasFailedProvisioning = circle.members.some(m => m.vaProvisionStatus === "FAILED")
  const isFullAndActive = activeMembersCount === circle.totalSlots

  // The requesting member's funding position this cycle.
  const myContributionMinor =
    circle.contributions?.find((c) => c.membershipId === myMembership?.id)?.amountMinor ?? 0
  const myAmountDueMinor = Math.max(0, circle.contributionMinor - myContributionMinor)
  const myBufferMinor = circle.myBufferMinor ?? 0
  const isPaidUpThisCycle = myAmountDueMinor === 0

  // Current cycle + payout derived values (used across the right column).
  const currentCycle = circle.currentCycle
  const recipient = currentCycle
    ? circle.members.find((m) => m.id === currentCycle.recipientMembershipId)
    : undefined
  const isMyTurn = !!recipient && recipient.user.id === session?.user?.id
  const payoutStatus = currentCycle?.payout?.status ?? "PENDING"
  const payoutStatusColor =
    ({
      PENDING: "text-su-muted",
      INITIATED: "text-su-accent-yellow",
      SUCCESS: "text-su-semantic-up",
      FAILED: "text-su-semantic-down",
    } as Record<string, string>)[payoutStatus] ?? "text-su-muted"
  const potPct = currentCycle
    ? Math.min(
        100,
        Math.round((currentCycle.potCollectedMinor / currentCycle.potExpectedMinor) * 100)
      )
    : 0

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
                  : isCompleted
                    ? "rounded-su-pill bg-su-muted/10 text-su-muted"
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

      {/* Key facts — a consistent strip so the page reads as one planned view */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Contribution", value: formatNaira(circle.contributionMinor) },
          { label: "Frequency", value: FREQUENCY_LABEL[circle.frequency] ?? circle.frequency },
          { label: "Members", value: `${activeMembersCount} / ${circle.totalSlots}` },
          {
            label: "Your position",
            value: myMembership?.payoutPosition ? `#${myMembership.payoutPosition}` : "—",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-su-xl border border-su-hairline bg-su-surface-card p-su-base"
          >
            <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
              {stat.label}
            </span>
            <p className="mt-1 font-su-mono text-su-title-sm font-semibold text-su-ink [font-feature-settings:'tnum']">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: funding + members + invites */}
        <div className="space-y-6 lg:col-span-2">
          {isActive && vaData?.virtualAccount && (
            <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="font-su-sans text-su-title-sm">Fund your circle</CardTitle>
                  {isPaidUpThisCycle ? (
                    <Badge className="rounded-su-pill bg-su-semantic-up/10 text-su-semantic-up">
                      Paid up this cycle
                    </Badge>
                  ) : (
                    <Badge className="rounded-su-pill bg-su-primary/10 text-su-primary">
                      {formatNaira(myAmountDueMinor)} due
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Per-member breakdown so it's clear what's paid, owed, and held as credit. */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-su-lg border border-su-hairline bg-su-surface p-3">
                    <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                      Contributed
                    </span>
                    <p className="mt-1 font-su-mono text-su-body-sm font-semibold text-su-ink [font-feature-settings:'tnum']">
                      {formatNaira(myContributionMinor)}
                      <span className="font-su-sans text-su-caption-sm font-normal text-su-muted">
                        {" "}
                        / {formatNaira(circle.contributionMinor)}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-su-lg border border-su-hairline bg-su-surface p-3">
                    <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                      Still due
                    </span>
                    <p
                      className={`mt-1 font-su-mono text-su-body-sm font-semibold [font-feature-settings:'tnum'] ${
                        isPaidUpThisCycle ? "text-su-semantic-up" : "text-su-ink"
                      }`}
                    >
                      {formatNaira(myAmountDueMinor)}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-su-lg border border-su-hairline bg-su-surface p-3 sm:col-span-1">
                    <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                      Your credit
                    </span>
                    <p
                      className={`mt-1 font-su-mono text-su-body-sm font-semibold [font-feature-settings:'tnum'] ${
                        myBufferMinor > 0 ? "text-su-semantic-up" : "text-su-ink"
                      }`}
                    >
                      {formatNaira(myBufferMinor)}
                    </p>
                  </div>
                </div>

                {myBufferMinor > 0 ? (
                  <p className="font-su-sans text-su-caption text-su-muted">
                    Your{" "}
                    <span className="font-su-mono text-su-semantic-up [font-feature-settings:'tnum']">
                      {formatNaira(myBufferMinor)}
                    </span>{" "}
                    credit (from a previous overpayment) is automatically applied to your next
                    contribution — you don&apos;t need to transfer it again.
                  </p>
                ) : (
                  <p className="font-su-sans text-su-caption text-su-muted">
                    {isPaidUpThisCycle
                      ? "You're all paid up for this cycle. Anything extra you send is saved as credit for the next one."
                      : "Transfer the amount still due to this dedicated account — it's matched to your circle automatically."}
                  </p>
                )}
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

          {isActive && (
            <AutoSaveBlock
              circleId={circle.id}
              autoDebitCardId={circle.myAutoDebitCardId ?? null}
              autoDebitWallet={circle.myAutoDebitWallet ?? false}
            />
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
          {/* Formation progress — only meaningful while filling slots */}
          {!isCompleted && (
            <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
              <CardHeader>
                <CardTitle className="font-su-sans text-su-title-sm">Membership</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between font-su-sans text-su-caption text-su-muted">
                    <span>Slots filled</span>
                    <span className="font-su-mono text-su-ink [font-feature-settings:'tnum']">
                      {slotsFilled} / {circle.totalSlots}
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* This cycle — pot progress + payout, cleanly separated */}
          {currentCycle && (
            <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="font-su-sans text-su-title-sm">
                    Cycle {currentCycle.sequence}
                  </CardTitle>
                  <Badge variant="outline" className="rounded-su-pill text-su-caption-sm">
                    {currentCycle.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between font-su-sans text-su-caption text-su-muted">
                    <span>Pot collected</span>
                    <span className="font-su-mono text-su-ink [font-feature-settings:'tnum']">
                      {formatNaira(currentCycle.potCollectedMinor)} /{" "}
                      {formatNaira(currentCycle.potExpectedMinor)}
                    </span>
                  </div>
                  <Progress value={potPct} className="h-2" />
                  <p className="pt-1 font-su-sans text-su-caption text-su-muted">
                    Due {new Date(currentCycle.deadline).toLocaleDateString()}
                  </p>
                </div>

                <div className="space-y-3 rounded-su-lg border border-su-hairline bg-su-surface p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-su-sans text-su-caption text-su-muted">Recipient</span>
                    <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                      {isMyTurn ? "You" : (recipient?.user.name ?? "—")}
                    </span>
                  </div>

                  {(currentCycle.status === "PAYOUT_INITIATED" ||
                    currentCycle.status === "PAID_OUT") && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-su-sans text-su-caption text-su-muted">
                          Payout status
                        </span>
                        <span
                          className={`font-su-sans text-su-caption font-semibold ${payoutStatusColor}`}
                        >
                          {payoutStatus}
                        </span>
                      </div>
                      {currentCycle.payout && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="font-su-sans text-su-caption text-su-muted">
                              Amount sent
                            </span>
                            <span className="font-su-mono text-su-body-sm font-semibold text-su-ink [font-feature-settings:'tnum']">
                              {formatNaira(currentCycle.payout.amountMinor)}
                            </span>
                          </div>
                          {currentCycle.payout.feeMinor > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="font-su-sans text-su-caption text-su-muted">
                                Transfer fee
                              </span>
                              <span className="font-su-mono text-su-caption text-su-muted [font-feature-settings:'tnum']">
                                −{formatNaira(currentCycle.payout.feeMinor)}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      {currentCycle.payout?.failureReason && (
                        <p className="font-su-sans text-su-caption text-su-semantic-down">
                          {currentCycle.payout.failureReason}
                        </p>
                      )}
                    </>
                  )}

                  {isCreator && currentCycle.status === "READY_TO_PAYOUT" && (
                    <Button
                      className="w-full rounded-su-pill"
                      onClick={() => triggerPayout(currentCycle.id)}
                      disabled={isTriggeringPayout}
                    >
                      {isTriggeringPayout ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Trigger payout
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

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

          {isCompleted && (
            <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
              <CardHeader>
                <CardTitle className="font-su-sans text-su-title-sm">Rotation complete</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-su-sans text-su-caption text-su-muted">
                  Every member has received a payout for this round.
                  {circle.renewalCount ? ` This circle has been renewed ${circle.renewalCount} time${circle.renewalCount > 1 ? "s" : ""}.` : ""}
                </p>

                {isCreator ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button className="w-full rounded-su-pill" disabled={isRenewing}>
                        {isRenewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Renew circle
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Start another rotation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Start another full rotation with the same members and amounts? Payout
                          order stays the same — position 1 collects first.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it closed</AlertDialogCancel>
                        <AlertDialogAction onClick={() => renewCircle()}>
                          Renew circle
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <p className="font-su-sans text-su-caption text-su-muted">
                    This circle is closed. The creator can start another rotation at any time.
                  </p>
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

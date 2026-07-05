"use client"

import { useCircleDetail, useVirtualAccount } from "../queries"
import { useCancelCircle, useLeaveCircle, useCancelInvite, useActivateCircle, useRetryProvisioning, useTriggerPayout, useRenewCircle, useSweepCircleCredit } from "../mutations"
import { InviteMemberDialog } from "./invite-member-form"
import { CycleHistory } from "./cycle-history"
import { PayNowDialog } from "./pay-now-dialog"
import { AutoSaveBlock } from "@/features/cards/components/auto-save-block"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Loader2, Copy, Check, Landmark } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
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

/** Friendly labels for cycle states — raw enum values read like log output. */
const CYCLE_STATUS_LABEL: Record<string, string> = {
  OPEN: "Collecting",
  COLLECTING: "Collecting",
  AWAITING_RESOLUTION: "Needs attention",
  READY_TO_PAYOUT: "Ready to pay out",
  PAYOUT_INITIATED: "Payout on the way",
  PAID_OUT: "Paid out",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
}

const CONTRIBUTION_CHIP: Record<string, { label: string; dot: string; text: string }> = {
  COMPLETE: { label: "Paid", dot: "bg-su-semantic-up", text: "text-su-semantic-up" },
  PARTIAL: { label: "Partial", dot: "bg-su-accent-yellow", text: "text-su-accent-yellow" },
  PENDING: { label: "Pending", dot: "bg-su-muted/40", text: "text-su-muted" },
  DEFAULTED: { label: "Missed", dot: "bg-su-semantic-down", text: "text-su-semantic-down" },
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function ordinal(n: number): string {
  const rem10 = n % 10
  const rem100 = n % 100
  if (rem10 === 1 && rem100 !== 11) return `${n}st`
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`
  return `${n}th`
}

function shortDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short" })
}

/** Eyebrow label — sections are structured by typography, not boxes. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-su-sans text-su-caption-sm font-semibold uppercase tracking-wider text-su-muted">
      {children}
    </h2>
  )
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
  const { mutate: sweepCredit, isPending: isSweeping } = useSweepCircleCredit(circleId)

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

  const activeMembersCount = circle.members.filter((m) => m.status === "ACTIVE").length
  const pendingInvites = circle.invites.filter((i) => i.status === "PENDING")
  const slotsFilled = activeMembersCount + pendingInvites.length
  const slotsPct = Math.round((slotsFilled / circle.totalSlots) * 100)

  const hasFailedProvisioning = circle.members.some((m) => m.vaProvisionStatus === "FAILED")
  const isFullAndActive = activeMembersCount === circle.totalSlots

  // My funding position this cycle.
  const myContributionMinor =
    circle.contributions?.find((c) => c.membershipId === myMembership?.id)?.amountMinor ?? 0
  const myAmountDueMinor = Math.max(0, circle.contributionMinor - myContributionMinor)
  const myBufferMinor = circle.myBufferMinor ?? 0
  const isPaidUpThisCycle = myAmountDueMinor === 0

  // Rotation state.
  const currentCycle = circle.currentCycle
  const recipient = currentCycle
    ? circle.members.find((m) => m.id === currentCycle.recipientMembershipId)
    : undefined
  const isMyTurn = !!recipient && recipient.user.id === session?.user?.id
  const potPct = currentCycle
    ? Math.min(100, Math.round((currentCycle.potCollectedMinor / currentCycle.potExpectedMinor) * 100))
    : 0
  const payoutInFlight =
    currentCycle?.status === "PAYOUT_INITIATED" || currentCycle?.status === "PAID_OUT"

  // Members who have already collected a pot (a PAID_OUT cycle names them).
  const collectedIds = new Set(
    (circle.cycles ?? []).filter((c) => c.status === "PAID_OUT").map((c) => c.recipientMembershipId)
  )
  const sortedMembers = [...circle.members].sort((a, b) => a.payoutPosition - b.payoutPosition)

  const va = vaData?.virtualAccount ?? null
  const hasHistory = (circle.cycles?.length ?? 0) > 0

  const statusPill = isForming
    ? "bg-su-accent-yellow/10 text-su-accent-yellow"
    : isCompleted
      ? "bg-su-muted/10 text-su-muted"
      : circle.status === "ACTIVE"
        ? "bg-su-semantic-up/10 text-su-semantic-up"
        : "bg-su-semantic-down/10 text-su-semantic-down"
  const statusLabel = circle.status.charAt(0) + circle.status.slice(1).toLowerCase()

  return (
    <div className="space-y-10">
      {/* ── Header: name, status, and the circle's "contract" in one line ── */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-su-display text-su-title-lg font-semibold tracking-su-title-lg text-su-ink">
              {circle.name}
            </h1>
            <span
              className={`rounded-su-pill px-2.5 py-0.5 font-su-sans text-su-caption font-semibold ${statusPill}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="font-su-sans text-su-body-sm text-su-muted">
            <span className="font-su-mono font-semibold text-su-ink [font-feature-settings:'tnum']">
              {formatNaira(circle.contributionMinor)}
            </span>{" "}
            {(FREQUENCY_LABEL[circle.frequency] ?? circle.frequency).toLowerCase()} ·{" "}
            {activeMembersCount} of {circle.totalSlots} members
            {myMembership && !isForming ? (
              <> · you collect {ordinal(myMembership.payoutPosition)}</>
            ) : null}
          </p>
        </div>

        {isForming && (
          <div className="shrink-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-su-muted hover:text-su-semantic-down"
                  disabled={isCancellingCircle || isLeavingCircle}
                >
                  {isCreator ? "Cancel circle" : "Leave circle"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isCreator ? "Cancel this circle?" : "Leave this circle?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isCreator
                      ? `This permanently cancels ${circle.name} and removes all members and pending invites. This can't be undone.`
                      : `You'll give up your slot in ${circle.name}. You can only rejoin if the creator invites you again.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{isCreator ? "Keep circle" : "Stay"}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      isCreator
                        ? cancelCircle(circle.id, {
                            onSuccess: () => {
                              toast.success("Circle cancelled")
                              router.push("/circles")
                            },
                            onError: (e) => toast.error(e.message),
                          })
                        : leaveCircle(circle.id, {
                            onSuccess: () => {
                              toast.success("You left the circle")
                              router.push("/circles")
                            },
                            onError: (e) => toast.error(e.message),
                          })
                    }
                  >
                    {isCreator ? "Cancel circle" : "Leave circle"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </header>

      {/* ── Hero: the ONE elevated surface. What matters right now. ── */}

      {isForming && (
        <section className="space-y-5 rounded-su-xl border border-su-hairline bg-su-surface-card p-su-lg shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-md space-y-1">
              <SectionLabel>Getting started</SectionLabel>
              <p className="font-su-sans text-su-body font-semibold text-su-ink">
                Waiting for all {circle.totalSlots} slots to fill
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">
                Accepted invites take a slot each. Once everyone is in, the creator activates the
                circle and each member gets a dedicated funding account.
              </p>
            </div>
            <div className="text-right">
              <p className="font-su-mono text-su-title-lg font-bold text-su-ink [font-feature-settings:'tnum']">
                {slotsFilled}
                <span className="text-su-muted">/{circle.totalSlots}</span>
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">slots filled</p>
            </div>
          </div>

          <Progress value={slotsPct} className="h-2" />

          {isCreator && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {activeMembersCount < circle.totalSlots && <InviteMemberDialog circleId={circle.id} />}
              {isFullAndActive && (
                <Button
                  className="rounded-su-pill"
                  onClick={() => activateCircle()}
                  disabled={isActivating || isRetrying}
                >
                  {isActivating || isRetrying ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Activate circle
                </Button>
              )}
              {hasFailedProvisioning && (
                <Button
                  variant="outline"
                  className="rounded-su-pill text-su-semantic-down"
                  onClick={() => retryProvisioning()}
                  disabled={isActivating || isRetrying}
                >
                  Retry failed accounts
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {isActive && currentCycle && (
        <section className="overflow-hidden rounded-su-xl border border-su-hairline bg-su-surface-card shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          {/* Asymmetric split: the status column is narrow, the pot gets the room. */}
          <div className="grid grid-cols-1 divide-y divide-su-hairline-soft lg:grid-cols-[2fr_3fr] lg:divide-x lg:divide-y-0">
            {/* Your side of the ledger — compact status */}
            <div className="flex flex-col justify-center gap-3 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>Your contribution</SectionLabel>
                <span className="font-su-sans text-su-caption text-su-muted">
                  Cycle {currentCycle.sequence} of {circle.totalSlots}
                </span>
              </div>

              {isPaidUpThisCycle ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-su-full bg-su-semantic-up/10 text-su-semantic-up">
                    <Check className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-su-sans text-su-body font-semibold text-su-ink">
                      You&apos;re paid up
                    </p>
                    <p className="font-su-sans text-su-caption text-su-muted">
                      {formatNaira(circle.contributionMinor)} contributed for this cycle.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="font-su-mono text-su-title-lg font-bold text-su-ink [font-feature-settings:'tnum']">
                      {formatNaira(myAmountDueMinor)}
                    </p>
                    <p className="mt-0.5 font-su-sans text-su-caption text-su-muted">
                      left to pay · due {shortDate(currentCycle.deadline)}
                      {myContributionMinor > 0 && (
                        <> · you&apos;ve sent {formatNaira(myContributionMinor)} so far</>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <PayNowDialog circleId={circle.id} amountDueMinor={myAmountDueMinor} />
                    <span className="font-su-sans text-su-caption text-su-muted">
                      or transfer / auto-save under{" "}
                      <span className="font-semibold text-su-ink">How you pay</span>
                    </span>
                  </div>
                </div>
              )}

              {myBufferMinor > 0 && (
                <p className="font-su-sans text-su-caption text-su-muted">
                  <span className="font-su-mono font-semibold text-su-semantic-up [font-feature-settings:'tnum']">
                    {formatNaira(myBufferMinor)}
                  </span>{" "}
                  credit applies to your next cycle automatically.
                </p>
              )}
            </div>

            {/* The circle's side: the pot — flat rows, no box-in-box */}
            <div className="space-y-4 bg-su-surface-soft p-5">
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>The pot</SectionLabel>
                <span className="font-su-sans text-su-caption font-semibold text-su-ink">
                  {CYCLE_STATUS_LABEL[currentCycle.status] ?? currentCycle.status}
                </span>
              </div>

              <div className="space-y-2">
                <p className="font-su-mono text-su-title-lg font-bold text-su-ink [font-feature-settings:'tnum']">
                  {formatNaira(currentCycle.potCollectedMinor)}{" "}
                  <span className="text-su-body-sm font-normal text-su-muted">
                    of {formatNaira(currentCycle.potExpectedMinor)}
                  </span>
                </p>
                <Progress value={potPct} className="h-2" />
                <p className="font-su-sans text-su-caption text-su-muted">
                  {potPct}% collected · closes {shortDate(currentCycle.deadline)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-su-hairline-soft pt-4">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-su-primary/10 font-su-sans text-su-caption-sm font-semibold text-su-primary">
                    {recipient ? initials(recipient.user.name) : "—"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-su-sans text-su-body-sm font-semibold text-su-ink">
                    {isMyTurn ? "You" : (recipient?.user.name ?? "—")}
                  </p>
                  <p className="font-su-sans text-su-caption text-su-muted">
                    {payoutInFlight ? "collected this pot" : "collects this pot"}
                  </p>
                </div>

                {payoutInFlight && currentCycle.payout && (
                  <div className="text-right">
                    <p className="font-su-mono text-su-body-sm font-semibold text-su-ink [font-feature-settings:'tnum']">
                      {formatNaira(currentCycle.payout.amountMinor)} sent
                    </p>
                    {currentCycle.payout.feeMinor > 0 && (
                      <p className="font-su-mono text-su-caption-sm text-su-muted [font-feature-settings:'tnum']">
                        −{formatNaira(currentCycle.payout.feeMinor)} transfer fee
                      </p>
                    )}
                  </div>
                )}

                {isCreator && currentCycle.status === "READY_TO_PAYOUT" && (
                  <Button
                    className="rounded-su-pill"
                    onClick={() => triggerPayout(currentCycle.id)}
                    disabled={isTriggeringPayout}
                  >
                    {isTriggeringPayout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Send payout to {isMyTurn ? "yourself" : recipient?.user.name?.split(" ")[0]}
                  </Button>
                )}
              </div>

              {payoutInFlight && currentCycle.payout?.status === "FAILED" && (
                <p className="font-su-sans text-su-caption text-su-semantic-down">
                  Payout failed{" "}
                  {currentCycle.payout.failureReason
                    ? `— ${currentCycle.payout.failureReason}`
                    : "— our team is on it."}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {isCompleted && (
        <section className="flex flex-col gap-4 rounded-su-xl border border-su-hairline bg-su-surface-card p-su-lg shadow-[0_4px_12px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-su-full bg-su-semantic-up/10 text-su-semantic-up">
              <Check className="h-5 w-5" />
            </span>
            <div>
              <p className="font-su-sans text-su-body font-semibold text-su-ink">
                Rotation complete
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">
                All {circle.totalSlots} members have collected a pot.
                {circle.renewalCount
                  ? ` Renewed ${circle.renewalCount} time${circle.renewalCount > 1 ? "s" : ""}.`
                  : ""}
              </p>
            </div>
          </div>

          {isCreator ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="rounded-su-pill" disabled={isRenewing}>
                  {isRenewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Start another rotation
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Start another rotation?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Same members, same amounts, same order — position 1 collects first again.
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
              The creator can start another rotation any time.
            </p>
          )}
        </section>
      )}

      {/* Leftover credit on a finished circle — normally auto-swept at
          completion; this covers a payment that settled afterwards. */}
      {!isActive && !isForming && myBufferMinor > 0 && (
        <section className="flex flex-col gap-4 rounded-su-xl border border-su-primary/30 bg-su-primary/[0.04] p-su-lg sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
              You have{" "}
              <span className="font-su-mono text-su-semantic-up [font-feature-settings:'tnum']">
                {formatNaira(myBufferMinor)}
              </span>{" "}
              in leftover credit
            </p>
            <p className="font-su-sans text-su-caption text-su-muted">
              This circle has finished — move it to your wallet to spend or withdraw it.
            </p>
          </div>
          <Button
            className="rounded-su-pill"
            onClick={() => sweepCredit()}
            disabled={isSweeping}
          >
            {isSweeping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Move to wallet
          </Button>
        </section>
      )}

      {/* ── How you pay: bank transfer + auto-save, one panel ── */}
      {isActive && (
        <section>
          <SectionLabel>How you pay</SectionLabel>
          <div className="mt-3 overflow-hidden rounded-su-xl border border-su-hairline bg-su-surface-card">
            <div className="grid grid-cols-1 divide-y divide-su-hairline-soft lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              {/* Manual: the dedicated funding account */}
              <div className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-su-primary" />
                  <h3 className="font-su-sans text-su-body font-semibold text-su-ink">
                    Bank transfer
                  </h3>
                </div>

                {va ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                          Your circle account
                        </span>
                        <p className="font-su-mono text-su-title-md font-semibold text-su-ink [font-feature-settings:'tnum']">
                          {va.bankAccountNumber}
                        </p>
                        <p className="font-su-sans text-su-caption text-su-muted">
                          {va.bankName} · {va.bankAccountName}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-su-pill"
                        onClick={() => {
                          navigator.clipboard.writeText(va.bankAccountNumber)
                          toast.success("Account number copied")
                        }}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Copy
                      </Button>
                    </div>
                    <p className="font-su-sans text-su-caption-sm text-su-muted">
                      Send any amount — transfers are matched to this circle automatically, and
                      extras carry over as credit for your next cycle.
                    </p>
                  </>
                ) : (
                  <p className="font-su-sans text-su-caption text-su-muted">
                    Your funding account is still being set up. Check back shortly.
                  </p>
                )}
              </div>

              {/* Automatic: wallet-first + saved card */}
              <div className="p-5">
                <AutoSaveBlock
                  circleId={circle.id}
                  autoDebitCardId={circle.myAutoDebitCardId ?? null}
                  autoDebitWallet={circle.myAutoDebitWallet ?? false}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── The rotation + past cycles, side by side ── */}
      <div className={`grid grid-cols-1 items-start gap-8 ${hasHistory ? "lg:grid-cols-2" : ""}`}>
        <section className={hasHistory ? "" : "max-w-3xl"}>
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Rotation</SectionLabel>
            {isActive && currentCycle && (
              <span className="font-su-sans text-su-caption text-su-muted">
                cycle {currentCycle.sequence} of {circle.totalSlots}
              </span>
            )}
          </div>
          <p className="mt-1 font-su-sans text-su-caption text-su-muted">
            Every cycle, each member pays in — and one collects the whole pot, in this order.
          </p>

          <ol className="mt-4 divide-y divide-su-hairline-soft">
            {sortedMembers.map((member) => {
              const collected = collectedIds.has(member.id)
              const receiving =
                isActive && !!currentCycle && member.id === currentCycle.recipientMembershipId && !collected
              const isMe = member.user.id === session?.user?.id
              const contribution = circle.contributions?.find((c) => c.membershipId === member.id)
              const chip = CONTRIBUTION_CHIP[contribution?.status ?? "PENDING"] ?? CONTRIBUTION_CHIP.PENDING!

              return (
                <li
                  key={member.id}
                  className={`flex items-center gap-4 py-3.5 ${receiving ? "-mx-3 rounded-su-lg bg-su-primary/[0.04] px-3" : ""}`}
                >
                  {/* Position in the queue: collected ✓ / collecting now / waiting */}
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-su-full font-su-mono text-su-caption-sm font-semibold [font-feature-settings:'tnum'] ${
                      collected
                        ? "bg-su-semantic-up/10 text-su-semantic-up"
                        : receiving
                          ? "bg-su-primary text-white"
                          : "bg-su-surface-strong text-su-muted"
                    }`}
                  >
                    {collected ? <Check className="h-3.5 w-3.5" /> : member.payoutPosition}
                  </span>

                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-su-surface-strong font-su-sans text-su-caption-sm font-semibold text-su-ink">
                      {initials(member.user.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-su-sans text-su-body-sm font-semibold text-su-ink">
                        {member.user.name}
                        {isMe && <span className="font-normal text-su-muted"> (you)</span>}
                      </span>
                      {receiving && (
                        <span className="rounded-su-pill bg-su-primary/10 px-2 py-0.5 font-su-sans text-su-caption-sm font-semibold text-su-primary">
                          Collecting now
                        </span>
                      )}
                    </div>
                    <p className="font-su-mono text-su-caption-sm text-su-muted">
                      @{member.user.username}
                      {member.role === "CREATOR" && (
                        <span className="font-su-sans"> · Creator</span>
                      )}
                    </p>
                  </div>

                  {/* This cycle's payment state (active circles only) */}
                  {isActive && currentCycle && (
                    <span className={`flex items-center gap-1.5 font-su-sans text-su-caption ${chip.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-su-full ${chip.dot}`} />
                      {chip.label}
                    </span>
                  )}
                  {collected && !isActive && (
                    <span className="font-su-sans text-su-caption text-su-semantic-up">Collected</span>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        {hasHistory && circle.cycles && (
          <CycleHistory cycles={circle.cycles} members={circle.members} />
        )}
      </div>

      {/* ── Pending invites (forming only) ── */}
      {pendingInvites.length > 0 && (
        <section className="max-w-3xl">
          <SectionLabel>Pending invites</SectionLabel>
          <ul className="mt-3 divide-y divide-su-hairline-soft">
            {pendingInvites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-4 py-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-su-surface-strong font-su-sans text-su-caption-sm font-semibold text-su-muted">
                    {initials(invite.invitedUser.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-su-sans text-su-body-sm font-semibold text-su-ink">
                    {invite.invitedUser.name}
                  </p>
                  <p className="font-su-mono text-su-caption-sm text-su-muted">
                    @{invite.invitedUser.username}
                  </p>
                </div>
                <span className="font-su-sans text-su-caption text-su-muted">
                  expires {shortDate(invite.expiresAt)}
                </span>
                {isCreator && isForming && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-su-muted hover:text-su-semantic-down"
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
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  )
}

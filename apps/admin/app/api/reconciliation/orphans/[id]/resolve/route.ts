import { NextResponse } from "next/server"
import { prisma, Prisma } from "@workspace/db"
import { matchInboundTransfer, type MatchContext } from "@workspace/db/reconciliation"
import { requireSuperAdmin } from "@/lib/access-control"
import { validateRequestBody } from "@/lib/api/validate"
import { resolveOrphanReqSchema } from "../../dto/orphan.dto"
import { recordAudit } from "@/lib/audit"

/**
 * Replay a spooled orphan credit into its member's contribution — the same
 * pot/buffer split the webhook applies (shared matchInboundTransfer). The
 * member is the VA owner (VA→membership is unique), so there's no
 * mis-assignment risk. If the member is already paid up, or there's no open
 * cycle, the amount lands in bufferMinor and auto-applies next cycle.
 *
 * Idempotent: guarded by the orphan's PENDING status inside the tx and the
 * unique (provider, providerEventId="orphan_<id>") on the created transfer.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSuperAdmin()
  if (error) return error

  const validation = await validateRequestBody(req, resolveOrphanReqSchema)
  if (!validation.success) return validation.errorResponse

  const { id } = await params
  const { note } = validation.data

  const orphan = await prisma.orphanTransaction.findUnique({
    where: { id },
    include: { virtualAccount: { include: { membership: true } } },
  })
  if (!orphan) return NextResponse.json({ error: "Orphan not found" }, { status: 404 })
  if (orphan.status !== "PENDING") {
    return NextResponse.json({ error: "Orphan is not pending" }, { status: 409 })
  }

  const va = orphan.virtualAccount
  const isCardCheckout = orphan.txType === "online_checkout"
  const isWalletVa = va && va.kind === "WALLET" && !va.membershipId

  if (!va || isWalletVa) {
    if (isCardCheckout || isWalletVa) {
      // Proxy to the web app to resolve to the user's global wallet
      const webUrl = process.env.WEB_APP_URL || "http://localhost:3000"
      const res = await fetch(`${webUrl}/api/internal/resolve-wallet-orphan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.CRON_SECRET || "test"}`,
        },
        body: JSON.stringify({
          orphanId: orphan.id,
          adminUserId: session.user.id,
          note: note,
        }),
      })

      let data;
      try {
        data = await res.json()
      } catch (e) {
        return NextResponse.json({ error: `Failed to resolve: received ${res.status} from web app proxy` }, { status: 502 })
      }

      if (!res.ok) {
        return NextResponse.json({ error: data?.error || "Failed to resolve orphan to wallet" }, { status: res.status })
      }

      return NextResponse.json(data)
    }

    return NextResponse.json({ 
      error: "This orphan was detected from the global sub-account feed and has no virtual account routing info. " +
        "It cannot be auto-replayed into a member's contribution. " +
        "Use 'Ignore' with a note, or trigger a Webhook Replay to recover the full event."
    }, { status: 409 })
  }

  const membership = va.membership
  // Orphans are only ever spooled for CIRCLE VAs (which have a membership).
  // Guard the now-nullable relation so a WALLET VA can never reach the
  // contribution-replay path.
  if (!membership) {
    return NextResponse.json({ error: "Orphan is not a circle contribution" }, { status: 409 })
  }

  // Build match context from the member's current cycle (mirrors dispatch.ts).
  const circle = await prisma.circle.findUnique({ where: { id: membership.circleId } })
  const cycle = circle
    ? await prisma.cycle.findUnique({
        where: {
          circleId_sequence: { circleId: circle.id, sequence: circle.currentCycleSeq },
        },
      })
    : null
  const existingContribution = cycle
    ? await prisma.contribution.findUnique({
        where: { cycleId_membershipId: { cycleId: cycle.id, membershipId: membership.id } },
      })
    : null

  const ctx: MatchContext = {
    virtualAccount: { id: va.id, accountRef: va.accountRef, membershipId: membership.id },
    membership: { id: membership.id, circleId: membership.circleId },
    circle: circle
      ? {
          id: circle.id,
          status: circle.status,
          contributionMinor: circle.contributionMinor,
          currentCycleSeq: circle.currentCycleSeq,
        }
      : null,
    cycle: cycle ? { id: cycle.id, sequence: cycle.sequence, status: cycle.status } : null,
    existingContribution: existingContribution
      ? {
          id: existingContribution.id,
          amountMinor: existingContribution.amountMinor,
          status: existingContribution.status,
        }
      : null,
  }

  const result = matchInboundTransfer(orphan.amountMinor, va.accountRef, ctx)
  // "Eligible" = there's an open cycle to apply this to. Otherwise (no active
  // circle / no open cycle) the whole amount becomes carried-over credit.
  const eligible = result.decision !== "UNKNOWN_VA" && result.decision !== "UNMATCHED"

  try {
    const applied = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Re-check under the tx to make double-replay a no-op.
      const fresh = await tx.orphanTransaction.findUnique({
        where: { id },
        select: { status: true },
      })
      if (!fresh || fresh.status !== "PENDING") {
        throw new Error("ORPHAN_NOT_PENDING")
      }

      const inbound = await tx.inboundTransfer.create({
        data: {
          provider: "NOMBA",
          providerEventId: `orphan_${orphan.id}`, // synthetic — orphans have no webhook event
          nombaTransactionId: orphan.nombaTransactionId,
          aliasAccountRef: va.accountRef,
          virtualAccountId: va.id,
          amountMinor: orphan.amountMinor,
          currency: orphan.currency,
          senderName: orphan.senderName,
          narration: orphan.narration,
          matchStatus: "MANUAL",
          matchedCycleId: eligible ? result.matchedCycleId : null,
          matchedMembershipId: membership.id,
          receivedAt: orphan.transactionAt,
        },
      })

      let appliedToPot = 0
      let appliedToBuffer = 0

      if (eligible && result.matchedCycleId) {
        await tx.contribution.upsert({
          where: {
            cycleId_membershipId: { cycleId: result.matchedCycleId, membershipId: membership.id },
          },
          update: {
            amountMinor: result.newContributionAmount,
            status: result.contributionStatus!,
          },
          create: {
            cycleId: result.matchedCycleId,
            membershipId: membership.id,
            amountMinor: result.newContributionAmount,
            status: result.contributionStatus!,
          },
        })

        if (result.amountToBuffer > 0) {
          await tx.membership.update({
            where: { id: membership.id },
            data: { bufferMinor: { increment: result.amountToBuffer } },
          })
          appliedToBuffer = result.amountToBuffer
        }

        if (result.amountAppliedToPot > 0) {
          const updatedCycle = await tx.cycle.update({
            where: { id: result.matchedCycleId },
            data: { potCollectedMinor: { increment: result.amountAppliedToPot } },
          })
          appliedToPot = result.amountAppliedToPot

          if (
            updatedCycle.potCollectedMinor >= updatedCycle.potExpectedMinor &&
            (updatedCycle.status === "OPEN" || updatedCycle.status === "COLLECTING")
          ) {
            await tx.cycle.update({
              where: { id: updatedCycle.id },
              data: { status: "READY_TO_PAYOUT" },
            })
          } else if (updatedCycle.status === "OPEN" && updatedCycle.potCollectedMinor > 0) {
            await tx.cycle.update({
              where: { id: updatedCycle.id },
              data: { status: "COLLECTING" },
            })
          }
        }
      } else {
        // No eligible cycle → the whole credit becomes carried-over buffer.
        await tx.membership.update({
          where: { id: membership.id },
          data: { bufferMinor: { increment: orphan.amountMinor } },
        })
        appliedToBuffer = orphan.amountMinor
      }

      await tx.orphanTransaction.update({
        where: { id },
        data: {
          status: "RESOLVED",
          inboundTransferId: inbound.id,
          resolvedByAdminId: session.user.id,
          resolvedAt: new Date(),
          resolutionNote: note ?? null,
        },
      })

      return { appliedToPot, appliedToBuffer }
    })

    await recordAudit({
      adminUserId: session.user.id,
      action: "ORPHAN_REPLAYED",
      entityType: "OrphanTransaction",
      entityId: id,
      metadata: {
        membershipId: membership.id,
        amountMinor: orphan.amountMinor,
        appliedToPot: applied.appliedToPot,
        appliedToBuffer: applied.appliedToBuffer,
        decision: result.decision,
        note: note ?? null,
      },
    })

    return NextResponse.json({ data: { id, status: "RESOLVED", ...applied } })
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === "P2002" || (e as Error).message === "ORPHAN_NOT_PENDING") {
      return NextResponse.json({ error: "Orphan already resolved" }, { status: 409 })
    }
    throw e
  }
}

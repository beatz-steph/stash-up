import { prisma } from "@workspace/db"
import type { NotificationType, Prisma } from "@workspace/db"
import { formatNaira } from "@/lib/money"

interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  link?: string
  metadata?: Prisma.InputJsonValue
}

/** Emit an in-app notification. Never throws into the caller. */
export async function createNotification(input: CreateNotificationInput) {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        metadata: input.metadata,
      },
    })
  } catch (error) {
    console.error("Failed to create notification:", error)
  }
}

/**
 * A contribution just landed for a member — from ANY funding path (bank
 * transfer, one-time card, or a wallet debit). Centralises the copy + type so
 * every "money went into a circle" event alerts the member consistently.
 * Best-effort (never throws).
 */
export async function notifyContributionReceived(params: {
  userId: string
  amountMinor: number
  circleName: string
  circleId: string
  cycleSequence?: number | null
}) {
  const cyc = params.cycleSequence ? ` for cycle ${params.cycleSequence}` : ""
  await createNotification({
    userId: params.userId,
    type: "CONTRIBUTION_RECEIVED",
    title: "Contribution received",
    body: `${formatNaira(params.amountMinor)} was applied to your ${params.circleName} contribution${cyc}.`,
    link: `/circles/${params.circleId}`,
  })
}

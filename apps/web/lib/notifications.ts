import { prisma } from "@workspace/db"
import type { NotificationType, Prisma } from "@workspace/db"

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

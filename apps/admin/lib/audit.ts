import { prisma, type Prisma } from "@workspace/db"

export async function recordAudit({
  adminUserId,
  action,
  entityType,
  entityId,
  metadata,
}: {
  adminUserId: string
  action: string
  entityType?: string
  entityId?: string
  metadata?: Prisma.InputJsonValue
}) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId,
        action,
        entityType,
        entityId,
        metadata: metadata ?? undefined,
      },
    })
  } catch (err) {
    console.error("Failed to record audit log:", err)
    // Never throw into the caller
  }
}

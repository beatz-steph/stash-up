import { z } from "zod"

export const NotificationTypeSchema = z.enum([
  "WELCOME",
  "EMAIL_VERIFIED",
  "CIRCLE_INVITE",
  "CIRCLE_JOINED",
  "CIRCLE_ACTIVATED",
  "CONTRIBUTION_DUE",
  "CONTRIBUTION_RECEIVED",
  "PAYOUT_SENT",
  "PAYOUT_RECEIVED",
  "DEFAULT_WARNING",
  "GENERIC",
])
export type NotificationTypeDto = z.infer<typeof NotificationTypeSchema>

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  metadata: z.unknown().nullable().optional(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
})
export type Notification = z.infer<typeof NotificationSchema>

export const NotificationListResSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: z.number(),
  nextCursor: z.string().nullable(),
})
export type NotificationListRes = z.infer<typeof NotificationListResSchema>

export const MarkReadReqSchema = z.object({
  // omit `ids` → mark ALL of the user's notifications read
  ids: z.array(z.string()).optional(),
})
export type MarkReadReq = z.infer<typeof MarkReadReqSchema>

export const MarkReadResSchema = z.object({ unreadCount: z.number() })
export type MarkReadRes = z.infer<typeof MarkReadResSchema>

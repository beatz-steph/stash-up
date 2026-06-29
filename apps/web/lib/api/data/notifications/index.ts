import { api, type ApiOptions } from "../../client"
import {
  NotificationListResSchema,
  MarkReadResSchema,
  type MarkReadReq,
} from "@/app/api/notifications/dto/notification.dto"

export function fetchNotifications(options?: ApiOptions) {
  return api.get("/api/notifications", NotificationListResSchema, options)
}

export function markNotificationsRead(body: MarkReadReq, options?: ApiOptions) {
  return api.post("/api/notifications/mark-read", body, MarkReadResSchema, options)
}

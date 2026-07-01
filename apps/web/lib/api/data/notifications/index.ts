import { api, type ApiOptions } from "../../client"
import type {
  NotificationListRes,
  MarkReadRes,
  MarkReadReq,
} from "@/app/api/notifications/dto/notification.dto"

export function fetchNotifications(options?: ApiOptions) {
  return api.get<NotificationListRes>("/api/notifications", options)
}

export function markNotificationsRead(body: MarkReadReq, options?: ApiOptions) {
  return api.post<MarkReadRes>("/api/notifications/mark-read", body, options)
}

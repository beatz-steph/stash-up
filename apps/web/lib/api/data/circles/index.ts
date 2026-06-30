import { api, type ApiOptions } from "../../client"
import { z } from "zod"
import {
  CircleSummaryResSchema,
  CircleDetailResSchema,
  InviteResSchema,
  CreateCircleReqSchema,
  InviteReqSchema,
} from "@/app/api/circles/dto/circles.dto"

export type CreateCircleInput = z.infer<typeof CreateCircleReqSchema>
export type InviteInput = z.infer<typeof InviteReqSchema>

export function fetchMyCircles(options?: ApiOptions) {
  return api.get("/api/circles", z.array(CircleSummaryResSchema), options)
}

export function fetchCircle(id: string, options?: ApiOptions) {
  return api.get(`/api/circles/${id}`, CircleDetailResSchema, options)
}

export function createCircle(body: CreateCircleInput, options?: ApiOptions) {
  // Returns the created circle row without a schema
  return api.post<{ id: string }>("/api/circles", body, undefined, options)
}

export function cancelCircle(id: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(`/api/circles/${id}/cancel`, undefined, undefined, options)
}

export function leaveCircle(id: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(`/api/circles/${id}/leave`, undefined, undefined, options)
}

export function inviteToCircle(id: string, body: InviteInput, options?: ApiOptions) {
  return api.post(`/api/circles/${id}/invites`, body, undefined, options)
}

export function cancelInvite(id: string, inviteId: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(
    `/api/circles/${id}/invites/${inviteId}/cancel`,
    undefined,
    undefined,
    options
  )
}

export function fetchMyInvites(options?: ApiOptions) {
  return api.get("/api/invites", z.array(InviteResSchema), options)
}

export function acceptInvite(id: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(`/api/invites/${id}/accept`, undefined, undefined, options)
}

export function declineInvite(id: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(`/api/invites/${id}/decline`, undefined, undefined, options)
}

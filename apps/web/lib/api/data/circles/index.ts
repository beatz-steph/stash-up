import { api, type ApiOptions } from "../../client"
import type { z } from "zod"
import type {
  CircleSummaryRes,
  CircleDetailRes,
  InviteRes,
  CreateCircleReqSchema,
  InviteReqSchema,
  CreateCircleRes,
  CreateInviteRes,
} from "@/app/api/circles/dto/circles.dto"

export type CreateCircleInput = z.infer<typeof CreateCircleReqSchema>
export type InviteInput = z.infer<typeof InviteReqSchema>

export function fetchMyCircles(options?: ApiOptions) {
  return api.get<CircleSummaryRes[]>("/api/circles", options)
}

export function fetchCircle(id: string, options?: ApiOptions) {
  return api.get<CircleDetailRes>(`/api/circles/${id}`, options)
}

export function createCircle(body: CreateCircleInput, options?: ApiOptions) {
  return api.post<CreateCircleRes>("/api/circles", body, options)
}

export function cancelCircle(id: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(`/api/circles/${id}/cancel`, undefined, options)
}

export function leaveCircle(id: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(`/api/circles/${id}/leave`, undefined, options)
}

export function inviteToCircle(id: string, body: InviteInput, options?: ApiOptions) {
  return api.post<CreateInviteRes>(`/api/circles/${id}/invites`, body, options)
}

export function cancelInvite(id: string, inviteId: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(
    `/api/circles/${id}/invites/${inviteId}/cancel`,
    undefined,
    options
  )
}

export function fetchMyInvites(options?: ApiOptions) {
  return api.get<InviteRes[]>("/api/invites", options)
}

export function acceptInvite(id: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(`/api/invites/${id}/accept`, undefined, options)
}

export function declineInvite(id: string, options?: ApiOptions) {
  return api.post<{ success: boolean }>(`/api/invites/${id}/decline`, undefined, options)
}

export function activateCircle(id: string, options?: ApiOptions) {
  return api.post<{ activated: boolean }>(`/api/circles/${id}/activate`, undefined, options)
}

export function retryProvisioning(id: string, options?: ApiOptions) {
  return api.post<{ activated: boolean }>(`/api/circles/${id}/provisioning/retry`, undefined, options)
}

export function fetchVirtualAccount(id: string, options?: ApiOptions) {
  return api.get<{ virtualAccount: { bankAccountNumber: string, bankAccountName: string, bankName: string } | null }>(`/api/circles/${id}/virtual-accounts`, options)
}

export function triggerPayout(id: string, cycleId: string, options?: ApiOptions) {
  return api.post<{ initiated: boolean }>(`/api/circles/${id}/cycles/${cycleId}/payout`, undefined, options)
}

export function renewCircle(id: string, options?: ApiOptions) {
  return api.post<{ cycleId: string; sequence: number }>(`/api/circles/${id}/renew`, undefined, options)
}

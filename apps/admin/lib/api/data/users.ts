import { api, type ApiOptions } from "../client"
import { userListResponseSchema, userDetailResponseSchema } from "@/app/api/users/dto/users.dto"

export async function getUsers(
  params: { page?: number; limit?: number; search?: string },
  options?: ApiOptions
) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", params.page.toString())
  if (params.limit) searchParams.set("limit", params.limit.toString())
  if (params.search) searchParams.set("search", params.search)

  return api.get(`/api/users?${searchParams.toString()}`, userListResponseSchema, options)
}

export async function getUser(id: string, options?: ApiOptions) {
  return api.get(`/api/users/${id}`, userDetailResponseSchema, options)
}

export async function blockUser(id: string, blocked: boolean, options?: ApiOptions) {
  return api.post(`/api/users/${id}/block`, { blocked }, undefined, options)
}

import { api, type ApiOptions } from "../client"
import { circleListResponseSchema, circleDetailResponseSchema } from "@/app/api/circles/dto/circles.dto"

export async function getCircles(
  params: { page?: number; limit?: number; status?: string },
  options?: ApiOptions
) {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", params.page.toString())
  if (params.limit) searchParams.set("limit", params.limit.toString())
  if (params.status) searchParams.set("status", params.status)

  return api.get(`/api/circles?${searchParams.toString()}`, circleListResponseSchema, options)
}

export async function getCircle(id: string, options?: ApiOptions) {
  return api.get(`/api/circles/${id}`, circleDetailResponseSchema, options)
}

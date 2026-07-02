import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { getCircles, getCircle } from "@/lib/api/data/circles"

export const circleKeys = {
  all: ["circles"] as const,
  lists: () => [...circleKeys.all, "list"] as const,
  list: (params: { page?: number; limit?: number; status?: string }) =>
    [...circleKeys.lists(), params] as const,
  details: () => [...circleKeys.all, "detail"] as const,
  detail: (id: string) => [...circleKeys.details(), id] as const,
}

export function useCircles(params: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: circleKeys.list(params),
    queryFn: () => getCircles(params),
    placeholderData: keepPreviousData,
  })
}

export function useCircle(id: string) {
  return useQuery({
    queryKey: circleKeys.detail(id),
    queryFn: () => getCircle(id),
    enabled: !!id,
  })
}

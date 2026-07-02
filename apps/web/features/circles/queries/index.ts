import { useQuery } from "@tanstack/react-query"
import { fetchMyCircles, fetchCircle, fetchMyInvites, fetchVirtualAccount } from "@/lib/api/data/circles"

export const CIRCLE_QUERY_KEYS = {
  all: ["circles"] as const,
  myCircles: () => [...CIRCLE_QUERY_KEYS.all, "mine"] as const,
  detail: (id: string) => [...CIRCLE_QUERY_KEYS.all, "detail", id] as const,
  myInvites: () => [...CIRCLE_QUERY_KEYS.all, "invites"] as const,
}

export function useMyCircles() {
  return useQuery({
    queryKey: CIRCLE_QUERY_KEYS.myCircles(),
    queryFn: () => fetchMyCircles(),
  })
}

export function useCircleDetail(id: string) {
  return useQuery({
    queryKey: CIRCLE_QUERY_KEYS.detail(id),
    queryFn: () => fetchCircle(id),
    enabled: !!id,
  })
}

export function useMyInvites() {
  return useQuery({
    queryKey: CIRCLE_QUERY_KEYS.myInvites(),
    queryFn: () => fetchMyInvites(),
  })
}

export function useVirtualAccount(circleId: string) {
  return useQuery({
    queryKey: [...CIRCLE_QUERY_KEYS.detail(circleId), "virtual-account"],
    queryFn: () => fetchVirtualAccount(circleId),
    enabled: !!circleId,
  })
}

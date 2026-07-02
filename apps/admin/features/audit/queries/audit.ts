import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { getAuditLogs } from "@/lib/api/data/audit"

export const auditKeys = {
  all: ["audit"] as const,
  lists: () => [...auditKeys.all, "list"] as const,
  list: (params: { page?: number; limit?: number }) =>
    [...auditKeys.lists(), params] as const,
}

export function useAuditLogs(params: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => getAuditLogs(params),
    placeholderData: keepPreviousData,
  })
}

import { useQuery } from "@tanstack/react-query"
import { getConfig } from "@/lib/api/data/config"

export const configKeys = {
  all: ["config"] as const,
  detail: () => [...configKeys.all, "detail"] as const,
}

export function useConfig() {
  return useQuery({
    queryKey: configKeys.detail(),
    queryFn: () => getConfig(),
  })
}

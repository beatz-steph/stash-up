import { useQuery } from "@tanstack/react-query"
import { fetchCards } from "@/lib/api/data/cards"

export const CARD_QUERY_KEYS = {
  all: ["cards"] as const,
  list: () => [...CARD_QUERY_KEYS.all, "list"] as const,
}

/** The signed-in user's saved cards (excludes revoked). */
export function useCards() {
  return useQuery({
    queryKey: CARD_QUERY_KEYS.list(),
    queryFn: () => fetchCards(),
  })
}

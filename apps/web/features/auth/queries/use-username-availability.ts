import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,}$/

export type UsernameStatus =
  | "idle"        // empty or too short to bother checking
  | "invalid"     // fails the format rules
  | "checking"    // request in flight
  | "available"
  | "taken"
  | "error"       // network / server failure

import { checkUsernameAvailable } from "@/lib/api/data/username-available"

/**
 * Debounced, cached username availability check. Drives the inline status
 * indicator on the sign-up form so the user knows before they submit.
 */
export function useUsernameAvailability(rawUsername: string) {
  const value = rawUsername.trim().toLowerCase()
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 400)
    return () => clearTimeout(timer)
  }, [value])

  const isValidFormat = USERNAME_PATTERN.test(debounced)

  const query = useQuery({
    queryKey: ["username-available", debounced],
    queryFn: () => checkUsernameAvailable(debounced),
    enabled: isValidFormat,
    staleTime: 60_000,
    retry: false,
  })

  let status: UsernameStatus = "idle"
  if (value.length === 0) status = "idle"
  else if (!USERNAME_PATTERN.test(value)) status = "invalid"
  else if (value !== debounced || query.isFetching) status = "checking"
  else if (query.isError) status = "error"
  else if (query.data === true) status = "available"
  else if (query.data === false) status = "taken"
  else status = "checking"

  return { status }
}

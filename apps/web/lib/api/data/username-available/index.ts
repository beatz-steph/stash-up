import { api, type ApiOptions } from "../../client"
import type { UsernameAvailableRes } from "@/app/api/username-available/dto/username-available.dto"

/** Typed wrapper around the username availability route handler. */
export async function checkUsernameAvailable(
  username: string,
  options?: ApiOptions,
): Promise<boolean> {
  const data = await api.get<UsernameAvailableRes>(
    `/api/username-available?username=${encodeURIComponent(username)}`,
    options,
  )
  return data.available
}

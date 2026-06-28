import { api, type ApiOptions } from "../../client"
import { UsernameAvailableResSchema } from "@/app/api/username-available/dto/username-available.dto"

/** Typed wrapper around the username availability route handler. */
export async function checkUsernameAvailable(
  username: string,
  options?: ApiOptions,
): Promise<boolean> {
  const data = await api.get(
    `/api/username-available?username=${encodeURIComponent(username)}`,
    UsernameAvailableResSchema,
    options,
  )
  return data.available
}

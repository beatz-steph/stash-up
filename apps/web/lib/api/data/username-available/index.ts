/** Typed wrapper around the username availability route handler. */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const res = await fetch(
    `/api/username-available?username=${encodeURIComponent(username)}`,
  )
  if (!res.ok) throw new Error("Failed to check username")
  const data = (await res.json()) as { available: boolean }
  return data.available
}

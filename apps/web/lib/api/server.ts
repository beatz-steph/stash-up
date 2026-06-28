import { headers } from "next/headers"
import type { ApiOptions } from "./client"

/**
 * Builds ApiOptions for calling our own API routes from Server Components:
 * the absolute origin + the forwarded session cookie, so auth travels with the
 * request. Importing `next/headers` makes this module server-only by nature.
 *
 * When the backend is extracted, swap the origin here for the service URL.
 */
export async function serverApiOptions(): Promise<ApiOptions> {
  const h = await headers()
  const host = h.get("host") ?? "localhost:3000"
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1")
  const protocol = isLocal ? "http" : "https"
  const cookie = h.get("cookie") ?? ""

  return {
    baseUrl: `${protocol}://${host}`,
    headers: cookie ? { cookie } : {},
  }
}

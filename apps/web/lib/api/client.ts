/**
 * Typed HTTP client for the StashUp API routes.
 *
 * Treat `app/api/**` as a standalone backend service that will later be extracted.
 * Every data read/write goes through it; the only exception is BetterAuth's
 * `auth.api.*`. Components — server OR client — call the typed wrappers built on
 * this client, never Prisma directly. When the backend moves to its own service,
 * only `baseUrl` resolution changes.
 *
 * - Client (browser): call wrappers with no options → same-origin, cookies sent automatically.
 * - Server Components: pass `await serverApiOptions()` → absolute origin + forwarded cookies.
 */

export interface ApiOptions {
  /** Absolute origin for server-side calls; empty (same-origin) on the client. */
  baseUrl?: string
  /** Extra headers, e.g. the forwarded session cookie for server-side calls. */
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: ApiOptions,
): Promise<T> {
  const { baseUrl = "", headers = {}, signal } = options
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    signal,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const parsed: unknown = await res.json().catch(() => null)
  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object"

  if (!res.ok || (isObj(parsed) && parsed.success === false)) {
    const message =
      isObj(parsed) && typeof parsed.error === "string"
        ? parsed.error
        : `Request failed (${res.status})`
    throw new Error(message)
  }

  // Support both standardized ApiResponse { success: true, data: T } and legacy/raw responses
  const payload = isObj(parsed) && parsed.success === true && "data" in parsed
    ? parsed.data
    : parsed

  return payload as T
}

export const api = {
  get: <T>(path: string, options: ApiOptions = {}) =>
    request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options: ApiOptions = {}) =>
    request<T>("POST", path, body, options),
}

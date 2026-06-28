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
 *
 * Pass a Zod schema to validate (and infer the type of) the response. Without one,
 * the response is cast to `T` and trusted.
 */
import type { z } from "zod"

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
  schema: z.ZodType<T> | undefined,
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

  const data: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`
    throw new Error(message)
  }

  return schema ? schema.parse(data) : (data as T)
}

export const api = {
  get: <T>(path: string, schema?: z.ZodType<T>, options: ApiOptions = {}) =>
    request<T>("GET", path, undefined, schema, options),
  post: <T>(path: string, body?: unknown, schema?: z.ZodType<T>, options: ApiOptions = {}) =>
    request<T>("POST", path, body, schema, options),
}

/**
 * Cursor pagination helper shared by list endpoints that page through a feed
 * ordered by `createdAt desc, id desc` (offset pagination breaks once the
 * underlying rows are a merge of multiple sources — e.g. transactions merges
 * InboundTransfer + Payout — because "page 2 offset N" shifts as new rows
 * land in either source between requests).
 *
 * Cursor shape: `base64(createdAt|id)` where `createdAt` is an ISO string.
 * The `id` tiebreaker guarantees a stable order (and no skipped/duplicated
 * rows) when multiple rows share the same `createdAt` millisecond.
 */

export interface Cursor {
  createdAt: string
  id: string
}

/** Encode a cursor from the last item of a page. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64")
}

/** Decode a `?cursor=` query param. Returns null for missing/malformed input (caller should treat as "first page"). */
export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8")
    const sep = decoded.lastIndexOf("|")
    if (sep === -1) return null
    const createdAt = decoded.slice(0, sep)
    const id = decoded.slice(sep + 1)
    if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

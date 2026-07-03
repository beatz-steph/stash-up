import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"
import { decodeCursor, encodeCursor } from "@/lib/api/cursor"
import { prisma } from "@workspace/db"
import type { NotificationListRes } from "./dto/notification.dto"

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 50

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) {
    return apiError("Unauthorized", 401)
  }

  const userId = session.user.id
  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT)
  const cursor = decodeCursor(url.searchParams.get("cursor"))
  // unreadCount is a global (un-paginated) count — only worth recomputing on
  // the first page request; later pages reuse whatever the client already has.
  const isFirstPage = !cursor

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        metadata: true,
        readAt: true,
        createdAt: true,
      },
    }),
    isFirstPage ? prisma.notification.count({ where: { userId, readAt: null } }) : Promise.resolve(0),
  ])

  const hasMore = rows.length > limit
  const page = rows.slice(0, limit)
  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor({
          createdAt: page[page.length - 1]!.createdAt.toISOString(),
          id: page[page.length - 1]!.id,
        })
      : null

  const items = page.map((n) => ({
    ...n,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }))

  return apiSuccess<NotificationListRes>({ items, unreadCount, nextCursor })
}

import { getSession } from "@/lib/session"
import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"

const NOTIFICATION_LIMIT = 30

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_LIMIT,
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
    prisma.notification.count({ where: { userId, readAt: null } }),
  ])

  const items = rows.map((n) => ({
    ...n,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }))

  return NextResponse.json({ items, unreadCount })
}

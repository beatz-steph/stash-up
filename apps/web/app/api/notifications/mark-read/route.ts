import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@workspace/db"
import { auth } from "@/lib/auth"
import { validateRequestBody } from "@/lib/api/validate"
import { MarkReadReqSchema } from "../dto/notification.dto"

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const validation = await validateRequestBody(request, MarkReadReqSchema)
  if (!validation.success) return validation.errorResponse

  const userId = session.user.id
  const { ids } = validation.data

  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  })

  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } })
  return NextResponse.json({ unreadCount })
}

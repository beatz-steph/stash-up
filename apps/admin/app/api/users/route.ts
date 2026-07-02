import { NextResponse } from "next/server"
import { prisma } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { paginationSchema, userListResponseSchema } from "./dto/users.dto"
import { z } from "zod"

const querySchema = paginationSchema.extend({
  search: z.string().optional(),
})

export async function GET(req: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const url = new URL(req.url)
  const queryParams = Object.fromEntries(url.searchParams.entries())
  
  const parsed = querySchema.safeParse(queryParams)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
  }

  const { page, limit, search } = parsed.data

  const whereClause = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { username: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {}

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        createdAt: true,
        lifetimeDefaultCount: true,
        blockedFromCircles: true,
      },
    }),
    prisma.user.count({ where: whereClause }),
  ])

  const response = {
    items: users,
    total,
    page,
    limit,
  }

  return NextResponse.json(userListResponseSchema.parse(response))
}

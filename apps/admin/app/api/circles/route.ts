import { NextResponse } from "next/server"
import { prisma, Prisma, CircleStatus } from "@workspace/db"
import { requireAdmin } from "@/lib/access-control"
import { paginationSchema, circleListResponseSchema } from "./dto/circles.dto"
import { z } from "zod"

const querySchema = paginationSchema.extend({
  // Upper-case then validate against the enum so a bad ?status= is a 400, not a
  // 500 at query time.
  status: z
    .preprocess((v) => (typeof v === "string" ? v.toUpperCase() : v), z.nativeEnum(CircleStatus))
    .optional(),
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

  const { page, limit, status } = parsed.data

  const whereClause: Prisma.CircleWhereInput = {}
  if (status) {
    whereClause.status = status
  }

  const [circles, total] = await Promise.all([
    prisma.circle.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        status: true,
        frequency: true,
        contributionMinor: true,
        totalSlots: true,
        createdAt: true,
        createdByUserId: true,
      },
    }),
    prisma.circle.count({ where: whereClause }),
  ])

  const response = {
    items: circles.map((c) => ({
      ...c,
      creatorId: c.createdByUserId,
    })),
    total,
    page,
    limit,
  }

  return NextResponse.json(circleListResponseSchema.parse(response))
}

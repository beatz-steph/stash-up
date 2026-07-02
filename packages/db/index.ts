import "server-only"

import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"

export * from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const connectionString = process.env.DATABASE_URL!
const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)

// Query logging is noisy and drowns out app logs. Default to error/warn in dev;
// opt back into full query logging with PRISMA_LOG_QUERIES=1 when you need it.
const devLog: ("query" | "error" | "warn")[] =
  process.env.PRISMA_LOG_QUERIES === "1" ? ["query", "error", "warn"] : ["error", "warn"]

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? devLog : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

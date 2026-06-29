import { prisma } from "@workspace/db"
import { hashPassword } from "better-auth/crypto"
import { randomUUID } from "node:crypto"

async function main() {
  const email = process.argv[2]
  const password = process.argv[3]
  const name = process.argv[4] || "Super Admin"

  if (!email || !password) {
    console.error("Usage: pnpm --filter admin seed <email> <password> [name]")
    process.exit(1)
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    console.error(`Admin with email ${email} already exists.`)
    process.exit(1)
  }

  console.log(`Creating SUPER_ADMIN: ${email}...`)

  // Insert directly with BetterAuth's own hasher (scrypt) so sign-in validates.
  // We don't use auth.api.signUpEmail because public sign-up is disabled.
  const userId = randomUUID()
  const now = new Date()
  const passwordHash = await hashPassword(password)

  await prisma.adminUser.create({
    data: {
      id: userId,
      email,
      name,
      emailVerified: true,
      role: "SUPER_ADMIN",
      createdAt: now,
      updatedAt: now,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: userId, // credential accounts use the user id
          providerId: "credential",
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      },
    },
  })

  console.log(`✅ Created SUPER_ADMIN: ${email}`)
}

main()
  .catch((e) => {
    console.error("Error creating super admin:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

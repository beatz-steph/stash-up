import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "@workspace/db"
import { twoFactor } from "better-auth/plugins"

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  user: {
    modelName: "AdminUser",
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "SUPPORT",
      },
    },
  },
  session: { modelName: "AdminSession" },
  account: { modelName: "AdminAccount" },
  verification: { modelName: "AdminVerification" },
  emailAndPassword: { enabled: true },
  plugins: [twoFactor()],
})

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "@workspace/db"

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
  // Admins are provisioned via scripts/seed.ts — never self-registration.
  // disableSignUp closes the public POST /api/auth/sign-up/email endpoint.
  emailAndPassword: { enabled: true, disableSignUp: true },
  // TODO(2fa): real 2FA for admins needs the twoFactor() plugin + its schema
  // (AdminUser.twoFactorEnabled + a TwoFactor model + migration) + an enrollment
  // UI. Left out for now so admin create/login work with password only.
  plugins: [],
})

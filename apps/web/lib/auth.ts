import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "@workspace/db"
import { username } from "better-auth/plugins"

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [username()],
  user: {
    additionalFields: {
      firstName: {
        type: "string",
        required: true,
      },
      lastName: {
        type: "string",
        required: true,
      },
      phone: {
        type: "string",
        required: false,
      },
      lifetimeDefaultCount: {
        type: "number",
        required: false,
        defaultValue: 0,
      },
      blockedFromCircles: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
    },
  },
})

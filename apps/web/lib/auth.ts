import * as React from "react"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "@workspace/db"
import { username } from "better-auth/plugins"
import { sendEmail } from "./email/send"
import { WelcomeEmail } from "./email/templates/welcome"
import { PasswordResetEmail } from "./email/templates/password-reset"
import { EmailVerificationEmail } from "./email/templates/email-verification"
import { PasswordChangedEmail } from "./email/templates/password-changed"

// Email verification model: "gate the money boundary, not the front door".
// - Verification email is sent on sign-up (sendOnSignUp).
// - requireEmailVerification stays OFF, so users can sign in and look around.
// - Money-movement actions (withdrawal account, circle create/join, contributions,
//   payouts) call requireVerifiedEmail() in lib/access-control.ts to enforce it.
// - The welcome email fires AFTER verification (afterEmailVerification), not on
//   sign-up, so users don't receive welcome + verify simultaneously.

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your StashUp password",
        react: React.createElement(PasswordResetEmail, { url }),
      })
    },
    onPasswordReset: async ({ user }) => {
      await sendEmail({
        to: user.email,
        subject: "Your StashUp password has been changed",
        react: React.createElement(PasswordChangedEmail),
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your StashUp email address",
        react: React.createElement(EmailVerificationEmail, { url }),
      })
    },
    afterEmailVerification: async (user) => {
      const firstName = (user as { firstName?: string }).firstName ?? "there"
      await sendEmail({
        to: user.email,
        subject: "Welcome to StashUp!",
        react: React.createElement(WelcomeEmail, { firstName }),
      })
    },
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

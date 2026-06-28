import { resend } from "./client"
import * as React from "react"

export interface SendEmailOptions {
  to: string
  subject: string
  react: React.ReactElement
}

export async function sendEmail({ to, subject, react }: SendEmailOptions) {
  if (!resend) {
    console.warn("Email sending disabled: Resend client not initialized.")
    return { success: false, error: "Resend client not initialized" }
  }

  const from = process.env.RESEND_FROM_EMAIL || "StashUp <noreply@stashup.xyz>"

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      react,
    })

    if (error) {
      // Intentionally omitting recipient address and raw error object to avoid leaking PII/secrets
      console.error("Failed to send email:", error.name, error.message)
      return { success: false, error: error.message }
    }

    console.log(`Successfully sent email with ID: ${data?.id}`)
    return { success: true, messageId: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Exception during email send:", message)
    return { success: false, error: message }
  }
}

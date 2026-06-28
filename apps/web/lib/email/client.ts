import { Resend } from "resend"

const apiKey = process.env.RESEND_API_KEY

export const resend = apiKey ? new Resend(apiKey) : null

if (!apiKey) {
  console.warn("RESEND_API_KEY is not set. Email sending will be disabled.")
}

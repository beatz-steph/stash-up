import * as React from "react"
import { Text, Button } from "@react-email/components"
import { EmailLayout } from "./_layout"

interface PasswordResetEmailProps {
  url: string
}

export const PasswordResetEmail = ({ url }: PasswordResetEmailProps) => {
  return (
    <EmailLayout
      previewText="Reset your StashUp password"
      heading="Password Reset Request"
      footerReason="You received this email because a password reset request was made for your StashUp account."
    >
      <Text style={text}>
        Someone recently requested a password reset for your StashUp account. If this was you, you can set a new password by clicking the button below:
      </Text>

      <div style={{ textAlign: "center", margin: "32px 0" }}>
        <Button style={button} href={url}>
          Reset Password
        </Button>
      </div>

      <Text style={text}>
        If you didn&apos;t request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </Text>
    </EmailLayout>
  )
}

const text = {
  color: "#333333",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "16px 0",
}

const button = {
  backgroundColor: "#0052ff",
  borderRadius: "4px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "14px 24px",
}

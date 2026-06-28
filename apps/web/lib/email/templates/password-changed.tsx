import * as React from "react"
import { Text, Button } from "@react-email/components"
import { EmailLayout } from "./_layout"

export const PasswordChangedEmail = () => {
  return (
    <EmailLayout
      previewText="Your StashUp password has been changed"
      heading="Password Changed Successfully"
      footerReason="You received this email because the password for your StashUp account was changed."
    >
      <Text style={text}>
        This is a confirmation that the password for your StashUp account has been successfully changed.
      </Text>

      <Text style={text}>
        If you made this change, you don&apos;t need to do anything else.
      </Text>

      <div style={{ backgroundColor: "#fff5f5", borderLeft: "4px solid #fc8181", padding: "16px", margin: "24px 0", borderRadius: "4px" }}>
        <Text style={{ ...text, margin: 0, fontWeight: 500 }}>
          Security Notice: If you didn&apos;t change your password, please contact our support team immediately as your account may be compromised.
        </Text>
      </div>

      <div style={{ textAlign: "center", margin: "32px 0" }}>
        <Button style={button} href="https://stashup.xyz/sign-in">
          Sign In to Your Account
        </Button>
      </div>
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

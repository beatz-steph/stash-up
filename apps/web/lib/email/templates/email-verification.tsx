import * as React from "react"
import { Text, Button } from "@react-email/components"
import { EmailLayout } from "./_layout"

interface EmailVerificationProps {
  url: string
}

export const EmailVerificationEmail = ({ url }: EmailVerificationProps) => {
  return (
    <EmailLayout
      previewText="Verify your StashUp email address"
      heading="Verify Your Email"
      footerReason="You received this email because you signed up for a StashUp account."
    >
      <Text style={text}>
        Thanks for joining StashUp! To complete your registration and secure your account, please verify your email address by clicking the button below:
      </Text>

      <div style={{ textAlign: "center", margin: "32px 0" }}>
        <Button style={button} href={url}>
          Verify Email Address
        </Button>
      </div>
      
      <Text style={text}>
        If you did not sign up for a StashUp account, please ignore this email.
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

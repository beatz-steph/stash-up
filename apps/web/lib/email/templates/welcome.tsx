import * as React from "react"
import { Text, Button } from "@react-email/components"
import { EmailLayout } from "./_layout"

interface WelcomeEmailProps {
  firstName: string
}

export const WelcomeEmail = ({ firstName }: WelcomeEmailProps) => {
  return (
    <EmailLayout
      previewText="Welcome to StashUp! 🚀"
      heading={`Welcome, ${firstName}!`}
      footerReason="You received this email because you signed up for a StashUp account."
    >
      <Text style={text}>
        We are thrilled to have you on board! StashUp is your digital platform for Ajo/Esusu savings circles. 
        By pooling funds together with friends or trusted community members, you can reach your financial goals faster and smarter.
      </Text>
      
      <Text style={text}>
        Ready to start building wealth together? Create a new savings circle or join an existing one today.
      </Text>

      <div style={{ textAlign: "center", margin: "32px 0" }}>
        <Button style={button} href="https://stashup.xyz/dashboard">
          Go to Dashboard
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

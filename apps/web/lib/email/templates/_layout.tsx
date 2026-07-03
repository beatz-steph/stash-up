import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"

// Email clients need absolute URLs (no relative paths). The site canonicalizes
// to the www origin (apex redirects), and some email proxies refuse to follow
// that redirect when fetching remote images — so point at www directly.
const EMAIL_ASSET_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stashup.xyz"

export interface EmailLayoutProps {
  children: React.ReactNode
  previewText: string
  heading?: string
  footerReason?: string
}

export const EmailLayout = ({
  children,
  previewText,
  heading,
  footerReason = "You received this because you are registered on StashUp.",
}: EmailLayoutProps) => {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={`${EMAIL_ASSET_ORIGIN}/logo.png`}
              width="40"
              height="40"
              alt="StashUp"
              style={logo}
            />
          </Section>

          {heading && (
            <Heading style={headingStyle}>{heading}</Heading>
          )}

          <Section style={content}>{children}</Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>{footerReason}</Text>
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} StashUp. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginTop: "40px",
  marginBottom: "64px",
  borderRadius: "8px",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  maxWidth: "500px",
}

const header = {
  padding: "24px 32px",
  textAlign: "center" as const,
}

const logo = {
  margin: "0 auto",
  display: "block", // Outlook gap fix
}

const headingStyle = {
  fontSize: "24px",
  letterSpacing: "-0.5px",
  lineHeight: "1.3",
  fontWeight: "600",
  color: "#1a1a1a",
  padding: "0 32px",
  textAlign: "center" as const,
}

const content = {
  padding: "0 32px",
}

const hr = {
  borderColor: "#e6ebf1",
  margin: "24px 0",
}

const footer = {
  padding: "0 32px",
  textAlign: "center" as const,
}

const footerText = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  margin: "4px 0",
}

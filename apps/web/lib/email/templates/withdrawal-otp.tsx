import * as React from "react"
import { Text } from "@react-email/components"
import { EmailLayout } from "./_layout"

interface WithdrawalOtpEmailProps {
  code: string
  expiryMinutes: number
}

export const WithdrawalOtpEmail = ({ code, expiryMinutes }: WithdrawalOtpEmailProps) => {
  return (
    <EmailLayout
      previewText="Your StashUp payout-account change code"
      heading="Confirm your payout account change"
      footerReason="You received this email because someone requested to change the withdrawal account on your StashUp profile."
    >
      <Text style={text}>
        Use this code to confirm the change to your payout (withdrawal) account. It expires in{" "}
        {expiryMinutes} minutes:
      </Text>

      <div style={{ textAlign: "center", margin: "32px 0" }}>
        <span style={codeStyle}>{code}</span>
      </div>

      <Text style={text}>
        If you did not request this change, do not share this code and no changes will be made —
        your payout account stays the same.
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

const codeStyle = {
  display: "inline-block",
  backgroundColor: "#f4f4f5",
  borderRadius: "8px",
  padding: "16px 28px",
  fontSize: "32px",
  fontWeight: "bold" as const,
  letterSpacing: "8px",
  color: "#0052ff",
  fontFamily: "monospace",
}

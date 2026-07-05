import * as React from "react"
import { Text } from "@react-email/components"
import { EmailLayout } from "./_layout"

interface PayoutReceivedEmailProps {
  amount: string // pre-formatted net amount sent, e.g. "₦50,000.00"
  circleName: string
  fee?: string // pre-formatted transfer fee, e.g. "₦25.00" (omitted when zero)
  gross?: string // pre-formatted pot total (net + fee)
}

export const PayoutReceivedEmail = ({ amount, circleName, fee, gross }: PayoutReceivedEmailProps) => {
  return (
    <EmailLayout
      previewText={`Your ${amount} StashUp payout is on its way`}
      heading="You've been paid! 🎉"
      footerReason="You received this email because it was your turn to receive the payout in your StashUp circle."
    >
      <Text style={text}>
        Great news — it was your turn in <strong>{circleName}</strong>, and your payout of{" "}
        <strong>{amount}</strong> has been sent to your withdrawal account.
      </Text>
      {fee && gross ? (
        <Text style={breakdown}>
          Circle pot: {gross}
          <br />
          Transfer fee: −{fee}
          <br />
          <strong>You receive: {amount}</strong>
        </Text>
      ) : null}
      <Text style={text}>
        Funds typically arrive within minutes. You can view the details anytime in your StashUp
        dashboard.
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

const breakdown = {
  color: "#555555",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "16px 0",
  padding: "12px 16px",
  backgroundColor: "#f6f6f6",
  borderRadius: "8px",
}

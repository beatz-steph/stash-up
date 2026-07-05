import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How StashUp collects, uses, and protects your data.",
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 font-su-sans text-su-title-sm font-semibold text-su-ink">{children}</h2>
  )
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 font-su-sans text-su-body-sm leading-relaxed text-su-muted">{children}</p>
}

export default function PrivacyPage() {
  return (
    <article>
      <h1 className="font-su-display text-su-display-sm font-bold tracking-tight text-su-ink">
        Privacy Policy
      </h1>
      <p className="mt-2 font-su-sans text-su-caption text-su-muted">Effective 5 July 2026</p>

      <P>
        This policy explains what data StashUp collects, how we use it, and the choices you have. By
        using StashUp you agree to the practices described here.
      </P>

      <H2>1. Data we collect</H2>
      <P>
        <strong className="text-su-ink">Account details</strong> — your name, email, and username.{" "}
        <strong className="text-su-ink">Financial details</strong> — your linked withdrawal bank
        account and the virtual accounts we provision for you.{" "}
        <strong className="text-su-ink">Transaction data</strong> — contributions, payouts, wallet
        top-ups and withdrawals, and their status. We do <em>not</em> store full card numbers — card
        payments are handled on our provider&apos;s secure checkout.
      </P>

      <H2>2. How we use your data</H2>
      <P>
        To operate your circles: collecting and matching contributions, reconciling payments,
        disbursing payouts, and notifying you of activity. We also use it to secure your account,
        prevent fraud, and comply with legal obligations.
      </P>

      <H2>3. Payment processing and sharing</H2>
      <P>
        Payments and payouts are processed by our payment provider, Nomba, who receives the
        information necessary to move funds (such as amounts and bank account details). We share data
        with service providers only as needed to run StashUp, and we do not sell your personal data.
      </P>

      <H2>4. Analytics</H2>
      <P>
        We use privacy-respecting product analytics to understand how features are used and improve
        the service. This helps us fix problems and prioritise what to build.
      </P>

      <H2>5. Data retention</H2>
      <P>
        We keep transaction and account records for as long as your account is active and as required
        to meet legal, accounting, and reconciliation obligations.
      </P>

      <H2>6. Security</H2>
      <P>
        Passwords and your transaction PIN are hashed, secrets are stored in environment
        configuration (never in code), and every money movement is reconciled against provider records.
        No system is perfectly secure, so keep your credentials private and use a strong password.
      </P>

      <H2>7. Your rights</H2>
      <P>
        You can access and update your account details in-app. You may request a copy of your data or
        deletion of your account, subject to records we must retain for legal and financial reasons.
      </P>

      <H2>8. Changes</H2>
      <P>
        We may update this policy as the service evolves; material changes will be communicated in-app.
      </P>

      <H2>9. Contact</H2>
      <P>
        For privacy questions or requests, reach us through the in-app support channel or the contact
        address published on our website.
      </P>

      <p className="mt-8 font-su-sans text-su-caption text-su-muted">
        This document is provided for a product built during a hackathon and is not legal advice.
      </p>
    </article>
  )
}

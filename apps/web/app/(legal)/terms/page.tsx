import type { Metadata } from "next"
import { AlertTriangle } from "lucide-react"

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms that govern your use of StashUp savings circles.",
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 font-su-sans text-su-title-sm font-semibold text-su-ink">{children}</h2>
  )
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 font-su-sans text-su-body-sm leading-relaxed text-su-muted">{children}</p>
}

export default function TermsPage() {
  return (
    <article>
      <h1 className="font-su-display text-su-display-sm font-bold tracking-tight text-su-ink">
        Terms &amp; Conditions
      </h1>
      <p className="mt-2 font-su-sans text-su-caption text-su-muted">Effective 5 July 2026</p>

      {/* Real-money disclosure */}
      <div className="mt-6 flex gap-3 rounded-su-xl border border-su-semantic-down/30 bg-su-semantic-down/[0.06] p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-su-semantic-down" />
        <div>
          <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
            StashUp handles real money.
          </p>
          <p className="mt-1 font-su-sans text-su-caption text-su-muted">
            Contributions and payouts are actual financial transactions processed through licensed
            payment rails. Money you send is real, and payouts are paid to real bank accounts. Only
            contribute what you can afford and only join circles with people you trust.
          </p>
        </div>
      </div>

      <P>
        These Terms govern your access to and use of StashUp (&quot;StashUp&quot;, &quot;we&quot;,
        &quot;us&quot;). By creating an account or using the service, you agree to these Terms.
      </P>

      <H2>1. What StashUp is</H2>
      <P>
        StashUp is a digital platform for running rotating savings circles (Ajo / Esusu / ROSCA). We
        provide the tools to create circles, collect contributions, reconcile payments, and disburse
        payouts. StashUp facilitates these transactions — we are not a bank, we do not take deposits
        on our own account, and circle funds are not insured deposits.
      </P>

      <H2>2. Eligibility</H2>
      <P>
        You must be at least 18 years old, provide accurate account and bank details, and use the
        service only for lawful purposes. You are responsible for keeping your login credentials and
        transaction PIN secure.
      </P>

      <H2>3. How circles work</H2>
      <P>
        A circle has a fixed contribution amount and a set rotation. Each cycle, every member
        contributes the agreed amount, and one member receives the pooled payout. The rotation
        continues until every member has received a payout. Joining a circle is a commitment to
        contribute for the full rotation.
      </P>

      <H2>4. Payments and fees</H2>
      <P>
        Contributions can be funded by bank transfer to your dedicated virtual account, from your
        StashUp wallet, or by card. Payments are processed by our payment provider (Nomba). Card and
        transfer fees charged by the provider are surfaced to you before you pay and are added on top
        of your contribution so the full amount reaches the pot. Payouts are sent to the recipient&apos;s
        linked bank account, net of any applicable transfer fee.
      </P>

      <H2>5. Your responsibilities</H2>
      <P>
        You agree to contribute on time, keep your withdrawal bank details accurate, and not attempt
        to defraud a circle or other members. Missed contributions can affect the circle and other
        members; repeated defaults may lead to removal.
      </P>

      <H2>6. Risks and no guarantee</H2>
      <P>
        Rotating savings depend on members honouring their commitments. StashUp reconciles and
        automates the mechanics, but we cannot guarantee that every member will contribute. We are not
        liable for losses arising from another member&apos;s default, from information you provide (such as
        an incorrect bank account), or from events outside our reasonable control.
      </P>

      <H2>7. Refunds, credits and disputes</H2>
      <P>
        Overpayments and amounts that cannot be applied to a cycle are held as wallet credit toward
        your next contribution. If you believe a transaction is incorrect, contact us promptly and we
        will investigate using our transaction records and provider reconciliation.
      </P>

      <H2>8. Your wallet</H2>
      <P>
        Your StashUp wallet holds funds you have topped up or that have been credited to you. Wallet
        balances can be used for contributions or withdrawn to your linked bank account, subject to any
        applicable fees and verification.
      </P>

      <H2>9. Suspension and termination</H2>
      <P>
        We may suspend or close accounts that violate these Terms, engage in fraud, or create risk for
        other members. Where funds are owed to you at closure, we will return them to your linked bank
        account after any obligations are settled.
      </P>

      <H2>10. Limitation of liability</H2>
      <P>
        To the fullest extent permitted by law, StashUp is provided &quot;as is&quot;. Our aggregate
        liability for any claim relating to the service is limited to the fees you paid to us in the
        three months preceding the claim.
      </P>

      <H2>11. Changes to these Terms</H2>
      <P>
        We may update these Terms as the service evolves. Material changes will be communicated in-app.
        Continued use after changes take effect constitutes acceptance.
      </P>

      <H2>12. Contact</H2>
      <P>
        Questions about these Terms? Reach us through the in-app support channel or at the contact
        address published on our website.
      </P>

      <p className="mt-8 font-su-sans text-su-caption text-su-muted">
        This document is provided for a product built during a hackathon and is not legal advice.
      </p>
    </article>
  )
}

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@workspace/ui/components/card"
import { WithdrawalAccountForm } from "@/features/onboarding/forms/withdrawal-account"

export default async function OnboardingWithdrawalPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/sign-in")
  }

  // Enforce step order: email must be verified before linking a payout account.
  if (!session.user.emailVerified) {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-su-canvas flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[480px] space-y-6">
        {/* Back Link and Step Indicator */}
        <div className="flex items-center justify-between px-1">
          <Link
            href="/"
            className="font-su-sans text-su-caption font-semibold text-su-primary hover:text-su-primary-active transition-colors flex items-center gap-1"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </Link>
          <span className="font-su-sans text-su-caption text-su-muted">
            Step 3 of 3
          </span>
        </div>

        {/* Card containing the form */}
        <Card className="bg-su-surface-card border border-su-hairline rounded-su-xl p-su-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          <CardContent className="p-0 space-y-6">
            <div className="space-y-2">
              <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink leading-[1.13]">
                Set up your withdrawal account
              </h1>
              <p className="font-su-sans text-su-body-sm text-su-muted">
                Where should we send your payouts when it&apos;s your turn to collect?
              </p>
            </div>

            <WithdrawalAccountForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

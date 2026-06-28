import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { SignOutButton } from "@/components/sign-out-button"
import { OnboardingBanner } from "@/features/onboarding/components/onboarding-banner"
import { fetchOnboardingStatus } from "@/lib/api/data/onboarding"
import { fetchWithdrawalAccount } from "@/lib/api/data/withdrawal-account"
import { serverApiOptions } from "@/lib/api/server"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/sign-in")
  }

  const { user } = session

  // Fetch onboarding status and withdrawal account via the API (backend layer),
  // forwarding the session cookie. Server Components only render — they don't read the DB.
  const apiOptions = await serverApiOptions()
  const [onboardingStatus, withdrawalAccount] = await Promise.all([
    fetchOnboardingStatus(apiOptions),
    fetchWithdrawalAccount(apiOptions),
  ])

  return (
    <div className="min-h-screen bg-su-canvas text-su-ink flex flex-col">
      {/* Real Top Navigation */}
      <nav className="bg-su-canvas h-16 border-b border-su-hairline-soft px-6 sm:px-8 flex items-center justify-between">
        <span className="font-su-display text-su-title-md font-semibold text-su-ink tracking-tight">
          StashUp
        </span>
        <div className="flex items-center gap-4">
          <span className="font-su-sans text-su-nav font-medium text-su-body">
            @{user.username}
          </span>
          <SignOutButton />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1000px] w-full mx-auto p-6 sm:p-8 space-y-8">
        <div className="space-y-1">
          <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">
            Good morning, {user.name}
          </h1>
          <p className="font-su-sans text-su-body-sm text-su-muted">
            Manage your rotating savings circles and payouts.
          </p>
        </div>

        {/* Onboarding banner — shows setup progress, or the circle unlock once complete */}
        <OnboardingBanner status={onboardingStatus} userEmail={user.email} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* User Information Card */}
          <Card className="bg-su-surface-card border border-su-hairline rounded-su-xl p-su-base shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <CardHeader className="pb-4">
              <CardTitle className="font-su-sans text-su-title-sm font-semibold text-su-ink">
                Profile Details
              </CardTitle>
              <CardDescription className="font-su-sans text-su-caption text-su-muted">
                Your StashUp account details
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-su-hairline-soft pt-0">
              <div className="flex justify-between py-3">
                <span className="font-su-sans text-su-body-sm text-su-muted">Name</span>
                <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">{user.name}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-su-sans text-su-body-sm text-su-muted">Username</span>
                <span className="font-su-sans text-su-body-sm font-mono text-su-primary">@{user.username}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-su-sans text-su-body-sm text-su-muted">Email</span>
                <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">{user.email}</span>
              </div>
            </CardContent>
          </Card>

          {/* Withdrawal Account Card */}
          <Card className="bg-su-surface-card border border-su-hairline rounded-su-xl p-su-base shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <CardHeader className="pb-4">
              <CardTitle className="font-su-sans text-su-title-sm font-semibold text-su-ink">
                Withdrawal Destination
              </CardTitle>
              <CardDescription className="font-su-sans text-su-caption text-su-muted">
                Bank account linked for payouts
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {withdrawalAccount ? (
                <div className="divide-y divide-su-hairline-soft">
                  <div className="flex justify-between py-3">
                    <span className="font-su-sans text-su-body-sm text-su-muted">Bank</span>
                    <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">{withdrawalAccount.bankName}</span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="font-su-sans text-su-body-sm text-su-muted">Account Number</span>
                    <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                      {withdrawalAccount.accountNumber.slice(0, 2) + "******" + withdrawalAccount.accountNumber.slice(-2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="font-su-sans text-su-body-sm text-su-muted">Account Name</span>
                    <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">{withdrawalAccount.accountName}</span>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center space-y-3">
                  <p className="font-su-sans text-su-body-sm text-su-muted">
                    No withdrawal account linked yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-su-canvas py-8 px-6 border-t border-su-hairline-soft text-center mt-12">
        <p className="font-su-sans text-su-caption text-su-muted">
          © 2026 StashUp. All rights reserved.
        </p>
      </footer>
    </div>
  )
}

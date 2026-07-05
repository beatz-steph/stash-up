import { requireSession } from "@/lib/session"

import { fetchWithdrawalAccount } from "@/lib/api/data/withdrawal-account"
import { serverApiOptions } from "@/lib/api/server"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { DashboardHeader, PageHeading, PageContent } from "../components/dashboard-header"
import { UpdateWithdrawalAccountDialog } from "@/features/settings/components/update-withdrawal-account-dialog"

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="font-su-sans text-su-body-sm text-su-muted">{label}</span>
      <span
        className={`font-semibold text-su-ink ${
          mono ? "font-su-mono text-su-body-sm [font-feature-settings:'tnum']" : "font-su-sans text-su-body-sm"
        }`}
      >
        {value}
      </span>
    </div>
  )
}

export default async function SettingsPage() {
  const session = await requireSession()
  
  const { user } = session

  const apiOptions = await serverApiOptions()
  const withdrawalAccount = await fetchWithdrawalAccount(apiOptions)

  const maskedAccount = withdrawalAccount
    ? withdrawalAccount.accountNumber.slice(0, 2) +
      "******" +
      withdrawalAccount.accountNumber.slice(-2)
    : null

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />
      <PageContent>
        <PageHeading title="Settings" subtitle="Your account and payout details." />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
            <CardHeader>
              <CardTitle className="font-su-sans text-su-title-sm font-semibold text-su-ink">
                Profile
              </CardTitle>
              <CardDescription className="font-su-sans text-su-caption text-su-muted">
                Your StashUp account details
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-su-hairline-soft pt-0">
              <Row label="Name" value={user.name ?? "—"} />
              <Row label="Username" value={`@${user.username}`} mono />
              <Row label="Email" value={user.email} />
            </CardContent>
          </Card>

          <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle className="font-su-sans text-su-title-sm font-semibold text-su-ink">
                    Withdrawal destination
                  </CardTitle>
                  <CardDescription className="font-su-sans text-su-caption text-su-muted">
                    Bank account linked for payouts
                  </CardDescription>
                </div>
                {withdrawalAccount && <UpdateWithdrawalAccountDialog />}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {withdrawalAccount ? (
                <div className="divide-y divide-su-hairline-soft">
                  <Row label="Bank" value={withdrawalAccount.bankName} />
                  <Row label="Account number" value={maskedAccount!} mono />
                  <Row label="Account name" value={withdrawalAccount.accountName} />
                </div>
              ) : (
                <p className="py-6 text-center font-su-sans text-su-body-sm text-su-muted">
                  No withdrawal account linked yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </div>
  )
}

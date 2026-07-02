import { requireSession } from "@/lib/session"

import { DashboardHeader, PageHeading, PageContent } from "../components/dashboard-header"
import { AllTransactions } from "@/features/transactions/components/all-transactions"

export default async function TransactionsPage() {
  await requireSession()

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />
      <PageContent>
        <PageHeading
          title="Transactions"
          subtitle="Every contribution and payout across your circles."
        />
        <AllTransactions />
      </PageContent>
    </div>
  )
}

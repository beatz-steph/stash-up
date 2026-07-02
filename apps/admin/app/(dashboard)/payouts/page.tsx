import { PayoutsTable } from "@/features/payouts/components/payouts-table"

export default function PayoutsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Payouts</h1>
        <p className="font-su-sans text-su-body-sm text-su-muted">
          Track and monitor all payouts.
        </p>
      </div>
      <PayoutsTable />
    </div>
  )
}

import { ReconciliationTable } from "@/features/reconciliation/components/reconciliation-table"

export default function ReconciliationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Reconciliation Queue</h1>
        <p className="font-su-sans text-su-body-sm text-su-muted">
          Exception queue for inbound transfers that require manual attention.
        </p>
      </div>
      <ReconciliationTable />
    </div>
  )
}

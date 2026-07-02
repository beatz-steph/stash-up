import { WebhooksTable } from "@/features/webhooks/components/webhooks-table"

export default function WebhooksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Webhooks</h1>
        <p className="font-su-sans text-su-body-sm text-su-muted">
          View webhook receipts from providers.
        </p>
      </div>
      <WebhooksTable />
    </div>
  )
}

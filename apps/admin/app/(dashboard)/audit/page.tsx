import { AuditTable } from "@/features/audit/components/audit-table"

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Audit Log</h1>
        <p className="font-su-sans text-su-body-sm text-su-muted">
          Track administrative actions across the platform.
        </p>
      </div>
      <AuditTable />
    </div>
  )
}

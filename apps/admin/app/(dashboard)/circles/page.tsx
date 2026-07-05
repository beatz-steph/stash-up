import { CirclesTable } from "@/features/circles/components/circles-table"

export const metadata = { title: "Circles" }

export default function CirclesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Circles</h1>
        <p className="font-su-sans text-su-body-sm text-su-muted">
          Manage and monitor all savings circles.
        </p>
      </div>
      <CirclesTable />
    </div>
  )
}

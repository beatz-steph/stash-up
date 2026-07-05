import { UsersTable } from "@/features/users/components/users-table"

export const metadata = { title: "Users" }

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Users</h1>
        <p className="font-su-sans text-su-body-sm text-su-muted">
          Manage platform users and view their details.
        </p>
      </div>
      <UsersTable />
    </div>
  )
}

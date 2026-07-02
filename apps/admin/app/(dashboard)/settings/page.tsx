import { redirect } from "next/navigation"
import { requireSuperAdmin } from "@/lib/access-control"
import { ConfigCard } from "@/features/settings/components/config-card"

export default async function SettingsPage() {
  const { error } = await requireSuperAdmin()
  if (error) {
    redirect("/")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Settings</h1>
        <p className="font-su-sans text-su-body-sm text-su-muted">
          Manage platform configurations and integrations. (Super Admin only)
        </p>
      </div>
      <ConfigCard />
    </div>
  )
}

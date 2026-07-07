import { redirect } from "next/navigation"
import { SignOutButton } from "@/components/sign-out-button"
import { SidebarNav } from "@/components/sidebar-nav"
import { getAdminSession } from "@/lib/session"

import { IdleLogout } from "@/components/idle-logout"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession()
  if (!session) {
    redirect("/login")
  }

  const { user } = session
  const role = user.role ?? "SUPPORT"

  return (
    <div className="flex min-h-svh bg-su-surface-soft text-su-ink">
      <IdleLogout />
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-su-hairline bg-su-canvas lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-su-hairline-soft px-6">
          <span className="font-su-display text-su-title-md font-semibold tracking-tight text-su-ink">
            StashUp
          </span>
          <span className="rounded-su-pill bg-su-primary/10 px-2 py-0.5 font-su-sans text-su-caption-sm font-semibold text-su-primary">
            Admin
          </span>
        </div>
        <SidebarNav role={role} />
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-su-hairline-soft bg-su-canvas px-6">
          <span className="font-su-display text-su-title-sm font-semibold text-su-ink lg:hidden">
            StashUp Admin
          </span>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex flex-col items-end leading-tight">
              <span className="font-su-sans text-su-body-sm font-semibold text-su-ink">{user.name}</span>
              <span className="font-su-sans text-su-caption-sm font-medium text-su-muted">{role}</span>
            </div>
            <div className="h-8 w-px bg-su-hairline" />
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}

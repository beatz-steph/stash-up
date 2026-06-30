import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { IncomingInvitesList } from "@/features/circles/components/incoming-invites-list"
import { NotificationBell } from "@/features/notifications/components/notification-bell"

export default function InvitesPage() {
  return (
    <div className="flex flex-col flex-1 h-full">
      {/* Top Navigation */}
      <nav className="bg-su-canvas h-16 border-b border-su-hairline-soft px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1000px] w-full mx-auto p-6 sm:p-8 space-y-8">
        <div className="space-y-1">
          <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">
            Incoming Invites
          </h1>
          <p className="font-su-sans text-su-body-sm text-su-muted">
            Manage your invitations to join circles.
          </p>
        </div>

        <IncomingInvitesList />
      </main>
    </div>
  )
}

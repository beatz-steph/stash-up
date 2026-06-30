import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { CreateCircleForm } from "@/features/circles/components/create-circle-form"
import { NotificationBell } from "@/features/notifications/components/notification-bell"

export default function NewCirclePage() {
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
      <main className="flex-1 max-w-[800px] w-full mx-auto p-6 sm:p-8 space-y-8">
        <div className="space-y-1">
          <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">
            Create a New Circle
          </h1>
          <p className="font-su-sans text-su-body-sm text-su-muted">
            Start a new rotating savings circle and invite your friends.
          </p>
        </div>

        <CreateCircleForm />
      </main>
    </div>
  )
}

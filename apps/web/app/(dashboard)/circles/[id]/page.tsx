import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { CircleDetail } from "@/features/circles/components/circle-detail"
import { NotificationBell } from "@/features/notifications/components/notification-bell"

export default async function CircleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

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
        <CircleDetail circleId={id} />
      </main>
    </div>
  )
}

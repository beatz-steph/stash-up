"use client"

import { useRouter } from "next/navigation"
import { Bell, Loader2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { useNotifications } from "../queries/use-notifications"
import { useMarkNotificationsRead } from "../mutations/use-mark-notifications-read"
import type { Notification } from "@/app/api/notifications/dto/notification.dto"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function NotificationBell() {
  const router = useRouter()
  const { items, unreadCount, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications()
  const markRead = useMarkNotificationsRead()

  const handleItemClick = (n: Notification) => {
    if (!n.readAt) markRead.mutate({ ids: [n.id] })
    if (n.link) router.push(n.link)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-10 w-10 rounded-su-full bg-su-canvas border-su-hairline text-su-ink hover:bg-su-surface-soft"
          aria-label="Notifications"
        >
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-su-full bg-su-primary px-1 text-su-on-primary text-su-caption-sm">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 bg-su-surface-card border-su-hairline rounded-su-lg shadow-lg"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-su-hairline-soft">
          <span className="font-su-sans text-su-title-sm font-semibold text-su-ink">
            Notifications
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate({})}
              disabled={markRead.isPending}
              className="font-su-sans text-su-caption font-semibold text-su-primary hover:text-su-primary-active"
            >
              Mark all read
            </button>
          )}
        </div>

        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center font-su-sans text-su-body-sm text-su-muted">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="divide-y divide-su-hairline-soft">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-su-surface-soft ${
                      n.readAt ? "" : "bg-su-surface-soft/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-su-full bg-su-primary" />
                      )}
                      <div className="space-y-0.5">
                        <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                          {n.title}
                        </p>
                        <p className="font-su-sans text-su-caption text-su-muted leading-snug">
                          {n.body}
                        </p>
                        <p className="font-su-sans text-su-caption-sm text-su-muted-soft">
                          {timeAgo(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasNextPage && (
            <div className="flex justify-center border-t border-su-hairline-soft p-3">
              <button
                type="button"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
                className="flex items-center gap-1.5 font-su-sans text-su-caption font-semibold text-su-primary hover:text-su-primary-active disabled:opacity-50"
              >
                {isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

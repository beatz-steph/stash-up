"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Users, Inbox, Settings } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { SignOutButton } from "@/components/sign-out-button"
import { useMyInvites } from "@/features/circles/queries"

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/circles", label: "Circles", icon: Users, exact: false },
  { href: "/invites", label: "Invites", icon: Inbox, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
] as const

export function AppSidebar({
  user,
}: {
  user: { name?: string | null; username?: string | null }
}) {
  const pathname = usePathname()
  const { data: invites } = useMyInvites()
  const pendingCount = invites?.filter((i) => i.status === "PENDING").length ?? 0

  const initials =
    user.name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "?"

  return (
    <Sidebar className="border-r border-su-hairline-soft">
      <SidebarHeader className="h-16 justify-center border-b border-su-hairline-soft px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="StashUp" width={24} height={24} className="h-6 w-6" />
          <span className="font-su-display text-su-title-md font-semibold tracking-tight text-su-ink">
            StashUp
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-su-muted-soft">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
                const isActive = exact ? pathname === href : pathname?.startsWith(href)
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                      <Link href={href}>
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {href === "/invites" && pendingCount > 0 && (
                      <SidebarMenuBadge className="bg-su-primary text-su-on-primary">
                        {pendingCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-3 border-t border-su-hairline-soft p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-su-surface-strong font-su-sans text-su-caption-sm font-semibold text-su-ink">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-su-sans text-su-body-sm font-semibold text-su-ink">
              {user.name}
            </span>
            <span className="truncate font-su-mono text-su-caption-sm text-su-muted">
              @{user.username}
            </span>
          </div>
        </div>
        <SignOutButton />
      </SidebarFooter>
    </Sidebar>
  )
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Users, Inbox, Circle } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@workspace/ui/components/sidebar"
import { SignOutButton } from "@/components/sign-out-button"

export function AppSidebar({ user }: { user: { name?: string | null; username?: string | null } }) {
  const pathname = usePathname()

  return (
    <Sidebar className="border-r border-su-hairline-soft bg-su-canvas text-su-ink">
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="font-su-display text-su-title-md font-semibold text-su-ink tracking-tight flex items-center gap-2">
          <Circle className="h-5 w-5" />
          StashUp
        </Link>
      </SidebarHeader>
      <SidebarSeparator className="bg-su-hairline-soft" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-su-muted">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"}>
                  <Link href="/">
                    <Home className="h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname?.startsWith("/circles")}>
                  <Link href="/circles">
                    <Users className="h-4 w-4" />
                    <span>Circles</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname?.startsWith("/invites")}>
                  <Link href="/invites">
                    <Inbox className="h-4 w-4" />
                    <span>Invites</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-su-surface-card border border-su-hairline flex items-center justify-center font-su-sans font-medium">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="font-su-sans text-sm font-semibold">{user.name}</span>
            <span className="font-su-sans text-xs text-su-muted">@{user.username}</span>
          </div>
        </div>
        <SignOutButton />
      </SidebarFooter>
    </Sidebar>
  )
}

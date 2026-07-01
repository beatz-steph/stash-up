"use client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ReactNode } from "react"

import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { Button } from "@workspace/ui/components/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationBell } from "@/features/notifications/components/notification-bell"

interface DashboardHeaderProps {
  /** Optional back link rendered to the left of the sidebar trigger. */
  backHref?: string
  backLabel?: string
}

/**
 * Sticky top chrome shared by every dashboard page. Fixed 64px height with a
 * hairline bottom border so it lines up exactly with the sidebar header.
 */
import { useIsOnboarded } from "@/features/onboarding/components/onboarding-provider"

export function DashboardHeader({ backHref, backLabel }: DashboardHeaderProps) {
  const isOnboarded = useIsOnboarded()

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-su-hairline-soft bg-su-canvas/80 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="text-su-muted" />
        {backHref && (
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-su-muted">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel ?? "Back"}
            </Link>
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isOnboarded && <NotificationBell />}
        <ThemeToggle />
      </div>
    </header>
  )
}

/**
 * Page title block placed at the top of the content area. Keeps the big heading
 * out of the fixed chrome so it can scroll with content.
 */
export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="font-su-display text-su-title-lg font-semibold tracking-su-title-lg text-su-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="font-su-sans text-su-body-sm text-su-muted">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}

import { OnboardingGuard } from "@/features/onboarding/components/onboarding-guard"

/**
 * Standard content wrapper — full desktop width with comfortable gutters,
 * capped wide so tables don't stretch on ultra-wide monitors.
 */
export function PageContent({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-8 px-4 py-8 sm:px-6 lg:px-10">
      <OnboardingGuard>
        {children}
      </OnboardingGuard>
    </main>
  )
}

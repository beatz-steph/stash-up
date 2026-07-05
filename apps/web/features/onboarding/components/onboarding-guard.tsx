"use client"

import { usePathname } from "next/navigation"
import { ReactNode } from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { useIsOnboarded } from "./onboarding-provider"

export function OnboardingGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isOnboarded = useIsOnboarded()

  if (isOnboarded || pathname === "/") {
    return <>{children}</>
  }

  return (
    <div className="relative min-h-[calc(100vh-64px)] w-full">
      <div className="blur-md pointer-events-none select-none opacity-50 transition-all duration-300">
        {children}
      </div>

      <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 px-4">
        <div className="bg-su-canvas border border-su-hairline-soft rounded-su-xl shadow-lg p-8 max-w-md w-full text-center space-y-6">
          <div className="space-y-2">
            <h2 className="font-su-display text-su-title-md font-semibold text-su-ink">Complete Onboarding</h2>
            <p className="text-su-muted font-su-sans text-su-body-sm">
              Please complete your onboarding to access this page.
            </p>
          </div>
          <Button asChild className="w-full rounded-su-pill">
            <Link href="/dashboard">
              Complete Onboarding
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

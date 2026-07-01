import { requireSession } from "@/lib/session"
import { ReactNode } from "react"
import { AppSidebar } from "./components/app-sidebar"
import {
  SidebarProvider,
  SidebarInset,
} from "@workspace/ui/components/sidebar"

import { fetchOnboardingStatus } from "@/lib/api/data/onboarding"
import { serverApiOptions } from "@/lib/api/server"
import { OnboardingProvider } from "@/features/onboarding/components/onboarding-provider"

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await requireSession()
  const { user } = session

  const onboardingStatus = await fetchOnboardingStatus(await serverApiOptions())
  const isOnboarded = onboardingStatus.account && onboardingStatus.verified && onboardingStatus.withdrawal

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset className="bg-su-canvas min-h-screen">
        <OnboardingProvider isOnboarded={isOnboarded}>
          {children}
        </OnboardingProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}

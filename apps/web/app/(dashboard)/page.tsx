import { requireSession } from "@/lib/session"
import Link from "next/link"
import { Plus } from "lucide-react"

import { OnboardingBanner } from "@/features/onboarding/components/onboarding-banner"
import { fetchOnboardingStatus } from "@/lib/api/data/onboarding"
import { fetchMyCircles } from "@/lib/api/data/circles"
import { serverApiOptions } from "@/lib/api/server"
import { Button } from "@workspace/ui/components/button"
import { PostHogIdentify } from "@/components/posthog-identify"
import { DashboardHeader, PageHeading, PageContent } from "./components/dashboard-header"
import { DashboardOverview } from "@/features/circles/components/dashboard-overview"
import { RecentTransactions } from "@/features/transactions/components/recent-transactions"

export default async function DashboardPage() {
  const session = await requireSession()
  
  const { user } = session

  const apiOptions = await serverApiOptions()
  const [onboardingStatus, circles] = await Promise.all([
    fetchOnboardingStatus(apiOptions),
    fetchMyCircles(apiOptions),
  ])
  const hasCircles = circles.length > 0

  const isOnboarded =
    onboardingStatus.account &&
    onboardingStatus.verified &&
    onboardingStatus.withdrawal

  const firstName = user.name?.split(" ")[0] ?? "there"

  return (
    <div className="flex min-h-screen flex-col">
      <PostHogIdentify userId={user.id} />
      <DashboardHeader />

      <PageContent>
        <PageHeading
          title={`Welcome back, ${firstName}`}
          subtitle="Here's what's happening across your savings circles."
          action={
            <Button
              asChild={isOnboarded}
              disabled={!isOnboarded}
              className="rounded-su-pill"
            >
              {isOnboarded ? (
                <Link href="/circles/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New circle
                </Link>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  New circle
                </>
              )}
            </Button>
          }
        />

        <OnboardingBanner status={onboardingStatus} userEmail={user.email} hasCircles={hasCircles} />

        <DashboardOverview />

        <RecentTransactions />
      </PageContent>
    </div>
  )
}

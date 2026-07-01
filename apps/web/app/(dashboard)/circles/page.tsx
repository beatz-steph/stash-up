import Link from "next/link"
import { Plus } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { CirclesList } from "@/features/circles/components/circles-list"
import { DashboardHeader, PageHeading, PageContent } from "../components/dashboard-header"

export default function CirclesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />
      <PageContent>
        <PageHeading
          title="My circles"
          subtitle="Manage your active and forming savings circles."
          action={
            <Button asChild className="rounded-su-pill">
              <Link href="/circles/new">
                <Plus className="mr-2 h-4 w-4" />
                New circle
              </Link>
            </Button>
          }
        />
        <CirclesList />
      </PageContent>
    </div>
  )
}

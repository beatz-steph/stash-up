import { CreateCircleForm } from "@/features/circles/components/create-circle-form"
import { DashboardHeader, PageHeading, PageContent } from "../../components/dashboard-header"

export default function NewCirclePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader backHref="/circles" backLabel="Circles" />
      <PageContent>
        <div className="mx-auto w-full max-w-2xl space-y-8">
          <PageHeading
            title="Create a new circle"
            subtitle="Start a rotating savings circle and invite your friends."
          />
          <CreateCircleForm />
        </div>
      </PageContent>
    </div>
  )
}

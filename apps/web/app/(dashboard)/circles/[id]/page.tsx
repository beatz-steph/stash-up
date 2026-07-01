import { CircleDetail } from "@/features/circles/components/circle-detail"
import { DashboardHeader, PageContent } from "../../components/dashboard-header"

export default async function CircleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader backHref="/circles" backLabel="Circles" />
      <PageContent>
        <CircleDetail circleId={id} />
      </PageContent>
    </div>
  )
}

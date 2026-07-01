import { IncomingInvitesList } from "@/features/circles/components/incoming-invites-list"
import { DashboardHeader, PageHeading, PageContent } from "../components/dashboard-header"

export default function InvitesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader />

      <PageContent>
        <PageHeading
          title="Incoming Invites"
          subtitle="Manage your invitations to join circles."
        />
        <IncomingInvitesList />
      </PageContent>
    </div>
  )
}

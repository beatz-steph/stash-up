import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { ReactNode } from "react"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DashboardOverview } from "./dashboard-overview"
import { OnboardingProvider } from "@/features/onboarding/components/onboarding-provider"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}))

const circleA = {
  id: "circle-a",
  name: "Alpha Circle",
  contributionMinor: 500000,
  frequency: "MONTHLY",
  status: "ACTIVE",
  totalSlots: 5,
  filledSlots: 5,
}
const circleB = {
  id: "circle-b",
  name: "Beta Circle",
  contributionMinor: 300000,
  frequency: "WEEKLY",
  status: "FORMING",
  totalSlots: 4,
  filledSlots: 2,
}

const pendingInvite = { id: "inv-1", status: "PENDING" }

let circlesResponse: unknown[] = []
let invitesResponse: unknown[] = []

const server = setupServer(
  http.get("*/api/circles", () => HttpResponse.json(circlesResponse)),
  http.get("*/api/invites", () => HttpResponse.json(invitesResponse)),
)

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  server.resetHandlers()
  circlesResponse = []
  invitesResponse = []
  vi.clearAllMocks()
})
afterAll(() => server.close())

function renderOverview(isOnboarded = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <OnboardingProvider isOnboarded={isOnboarded}>{children}</OnboardingProvider>
    </QueryClientProvider>
  )
  return render(<DashboardOverview />, { wrapper: Wrapper })
}

describe("DashboardOverview", () => {
  it("shows the empty state when the user has no circles", async () => {
    renderOverview()

    await waitFor(() => {
      expect(screen.getByText(/No circles yet/i)).toBeInTheDocument()
    })
    expect(screen.getByRole("link", { name: /Create a circle/i })).toBeInTheDocument()
  })

  it("renders circle cards and the stat row when circles exist", async () => {
    circlesResponse = [circleA, circleB]
    renderOverview()

    await waitFor(() => {
      expect(screen.getByText("Alpha Circle")).toBeInTheDocument()
    })
    expect(screen.getByText("Beta Circle")).toBeInTheDocument()
    expect(screen.getByText(/Your circles/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /View all/i })).toBeInTheDocument()
  })

  it("shows the pending-invites nudge when invites are pending", async () => {
    circlesResponse = [circleA]
    invitesResponse = [pendingInvite]
    renderOverview()

    await waitFor(() => {
      expect(screen.getByText(/Review and respond to your circle invitations/i)).toBeInTheDocument()
    })
  })

  it("does not show the nudge when there are no pending invites", async () => {
    circlesResponse = [circleA]
    invitesResponse = []
    renderOverview()

    await waitFor(() => {
      expect(screen.getByText("Alpha Circle")).toBeInTheDocument()
    })
    expect(
      screen.queryByText(/Review and respond to your circle invitations/i),
    ).not.toBeInTheDocument()
  })
})

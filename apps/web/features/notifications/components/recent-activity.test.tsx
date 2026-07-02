import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { ReactNode } from "react"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RecentActivity } from "./recent-activity"
import { OnboardingProvider } from "@/features/onboarding/components/onboarding-provider"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}))

const notification = {
  id: "n1",
  type: "PAYOUT_RECEIVED",
  title: "You've been paid!",
  body: "Your circle payout of ₦10,000.00 has been transferred.",
  link: "/circles/circle-1",
  readAt: null,
  createdAt: new Date().toISOString(),
}

let listResponse = { items: [] as unknown[], unreadCount: 0 }

const server = setupServer(
  http.get("*/api/notifications", () => HttpResponse.json(listResponse)),
)

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  server.resetHandlers()
  listResponse = { items: [], unreadCount: 0 }
  vi.clearAllMocks()
})
afterAll(() => server.close())

function renderActivity(isOnboarded = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <OnboardingProvider isOnboarded={isOnboarded}>{children}</OnboardingProvider>
    </QueryClientProvider>
  )
  return render(<RecentActivity />, { wrapper: Wrapper })
}

describe("RecentActivity", () => {
  it("renders nothing until the user is onboarded", () => {
    const { container } = renderActivity(false)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows the empty state when there are no notifications", async () => {
    renderActivity()
    await waitFor(() => {
      expect(screen.getByText(/No activity yet/i)).toBeInTheDocument()
    })
  })

  it("renders recent notifications when present", async () => {
    listResponse = { items: [notification], unreadCount: 1 }
    renderActivity()

    await waitFor(() => {
      expect(screen.getByText("You've been paid!")).toBeInTheDocument()
    })
    expect(
      screen.getByText(/Your circle payout of ₦10,000.00 has been transferred./i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No activity yet/i)).not.toBeInTheDocument()
  })
})

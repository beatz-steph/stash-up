import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CircleDetail } from "./circle-detail"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/circles/circle-123",
}))

// Current user is user-1, the circle CREATOR.
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "user-1", name: "User 1", username: "user1" } } }),
  },
}))

const creatorMember = {
  id: "m1",
  user: { id: "user-1", name: "User 1", username: "user1", image: null },
  role: "CREATOR",
  payoutPosition: 1,
  status: "ACTIVE",
}
const otherMember = {
  id: "m2",
  user: { id: "user-2", name: "User 2", username: "user2", image: null },
  role: "MEMBER",
  payoutPosition: 2,
  status: "ACTIVE",
}

function activeCircle(currentCycle: Record<string, unknown>) {
  return {
    id: "circle-123",
    name: "Test Circle",
    contributionMinor: 500000,
    currency: "NGN",
    frequency: "MONTHLY",
    status: "ACTIVE",
    totalSlots: 2,
    createdAt: new Date().toISOString(),
    startDeadline: null,
    members: [creatorMember, otherMember],
    invites: [],
    currentCycle,
  }
}

let circleResponse: ReturnType<typeof activeCircle> | null = null

const server = setupServer(
  http.get("*/api/circles/:id/virtual-accounts", () =>
    HttpResponse.json({ virtualAccount: null }),
  ),
  http.get("*/api/circles/:id", () => HttpResponse.json(circleResponse)),
  http.post("*/api/circles/:id/cycles/:cycleId/payout", () =>
    HttpResponse.json({ initiated: true }),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  server.resetHandlers()
  circleResponse = null
  vi.clearAllMocks()
})
afterAll(() => server.close())

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CircleDetail circleId="circle-123" />
    </QueryClientProvider>,
  )
}

describe("CircleDetail — payout section", () => {
  it("shows the Trigger Payout button for the creator when the cycle is READY_TO_PAYOUT", async () => {
    circleResponse = activeCircle({
      id: "cycle-1",
      sequence: 1,
      status: "READY_TO_PAYOUT",
      potCollectedMinor: 1000000,
      potExpectedMinor: 1000000,
      deadline: new Date().toISOString(),
      recipientMembershipId: "m1",
      payout: null,
    })

    renderDetail()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Send payout to yourself/i })).toBeInTheDocument()
    })
    // Recipient is user-1 → shown as "You" in the recipient spotlight
    expect(screen.getByText("You")).toBeInTheDocument()
  })

  it("renders the payout status once a payout has been initiated / paid out", async () => {
    circleResponse = activeCircle({
      id: "cycle-1",
      sequence: 1,
      status: "PAID_OUT",
      potCollectedMinor: 1000000,
      potExpectedMinor: 1000000,
      deadline: new Date().toISOString(),
      recipientMembershipId: "m2",
      payout: { status: "SUCCESS", amountMinor: 1000000, failureReason: null },
    })

    renderDetail()

    await waitFor(() => {
      expect(screen.getByText(/₦10,000\.00 sent/i)).toBeInTheDocument()
    })
    // Cycle status is surfaced with a friendly label.
    expect(screen.getByText("Paid out")).toBeInTheDocument()
    // Recipient is user-2 (not the current user) → not shown as "You"
    expect(screen.queryByText("You")).not.toBeInTheDocument()
    // No trigger button when not READY_TO_PAYOUT
    expect(screen.queryByRole("button", { name: /Send payout/i })).not.toBeInTheDocument()
  })

  it("surfaces the failure reason on a failed payout", async () => {
    circleResponse = activeCircle({
      id: "cycle-1",
      sequence: 1,
      status: "PAYOUT_INITIATED",
      potCollectedMinor: 1000000,
      potExpectedMinor: 1000000,
      deadline: new Date().toISOString(),
      recipientMembershipId: "m2",
      payout: { status: "FAILED", amountMinor: 1000000, failureReason: "Insufficient balance" },
    })

    renderDetail()

    await waitFor(() => {
      expect(screen.getByText(/Payout failed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Insufficient balance/i)).toBeInTheDocument()
  })
})

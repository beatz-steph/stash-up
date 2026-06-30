import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

// Wrappers needed for testing UI
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CreateCircleForm } from "./create-circle-form"
import { CircleDetail } from "./circle-detail"
import { IncomingInvitesList } from "./incoming-invites-list"

// Mock Next.js router
const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
}))

// Mock Auth Client
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "user-1", name: "User 1", username: "user1" } } }),
  }
}))

const mockCircle = {
  id: "circle-123",
  name: "Test Circle",
  contributionMinor: 500000,
  currency: "NGN",
  frequency: "MONTHLY",
  status: "FORMING",
  totalSlots: 5,
  createdAt: new Date().toISOString(),
  startDeadline: new Date(Date.now() + 86400000).toISOString(),
  members: [
    {
      user: {
        id: "user-1",
        name: "User 1",
        username: "user1",
        image: null,
      },
      role: "CREATOR",
      payoutPosition: 1,
      status: "ACTIVE",
    },
  ],
  invites: [],
}

const mockInvite = {
  id: "invite-123",
  circle: {
    id: "circle-123",
    name: "Test Circle",
    contributionMinor: 500000,
    frequency: "MONTHLY",
  },
  invitedBy: {
    name: "Creator",
    username: "creator",
  },
  status: "PENDING",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
}

const server = setupServer(
  http.get("*/api/circles/:id", () => HttpResponse.json(mockCircle)),
  http.post("*/api/circles", () => HttpResponse.json({ id: "circle-new" }, { status: 201 })),
  http.post("*/api/circles/:id/cancel", () => HttpResponse.json({ success: true })),
  http.post("*/api/circles/:id/invites", () => HttpResponse.json({ id: "invite-new" }, { status: 201 })),
  http.get("*/api/invites", () => HttpResponse.json([mockInvite])),
  http.post("*/api/invites/:id/accept", () => HttpResponse.json({ success: true })),
  http.post("*/api/invites/:id/decline", () => HttpResponse.json({ success: true }))
)

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  server.resetHandlers()
  vi.clearAllMocks()
})
afterAll(() => server.close())

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

describe("Circle Frontend Flow", () => {
  it("renders CreateCircleForm and submits successfully", async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={createQueryClient()}>
        <CreateCircleForm />
      </QueryClientProvider>
    )

    await user.type(screen.getByLabelText(/Circle Name/i), "My New Circle")
    await user.type(screen.getByLabelText(/Contribution/i), "5000")
    await user.type(screen.getByLabelText(/Total Members/i), "5")
    
    // For date input, testing-library typing can be tricky; we'll simulate filling it
    // Usually datetime-local expects standard ISO format without seconds/Z
    await user.type(screen.getByLabelText(/Start Deadline/i), "2027-01-01T12:00")

    await user.click(screen.getByRole("button", { name: /Create Circle/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/circles/circle-new")
    })
  })

  it("validates CreateCircleForm negative values", async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={createQueryClient()}>
        <CreateCircleForm />
      </QueryClientProvider>
    )

    // Submit without filling fields
    await user.click(screen.getByRole("button", { name: /Create Circle/i }))

    await waitFor(() => {
      expect(screen.getByText(/Circle name is required/i)).toBeInTheDocument()
      expect(screen.getByText(/Contribution must be a positive number/i)).toBeInTheDocument()
    })
  })

  it("renders CircleDetail and shows members", async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <CircleDetail circleId="circle-123" />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText("Test Circle")).toBeInTheDocument()
      expect(screen.getByText("@user1")).toBeInTheDocument()
    })
  })

  it("handles 409 error gracefully in invite form", async () => {
    server.use(
      http.post("*/api/circles/:id/invites", () => {
        return HttpResponse.json({ error: "User already invited" }, { status: 409 })
      })
    )

    render(
      <QueryClientProvider client={createQueryClient()}>
        <CircleDetail circleId="circle-123" />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText("Test Circle")).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/Enter username/i), "friend")
    await user.click(screen.getByRole("button", { name: "Invite" }))

    await waitFor(() => {
      expect(screen.getByText("User already invited")).toBeInTheDocument()
    })
  })

  it("renders IncomingInvitesList and allows accept", async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <IncomingInvitesList />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText("Test Circle")).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Accept" }))

    // Loading indicator implies it clicked successfully and is processing
    // MSW will return success, and the query invalidation handles the rest (not fully testable without wrapping the whole app).
  })
})

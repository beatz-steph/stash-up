import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest"
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import {
  fetchMyCircles,
  fetchCircle,
  fetchMyInvites,
  createCircle,
} from "./index"

const mockCircle = {
  id: "circle-123",
  name: "Test Circle",
  contributionMinor: 500000,
  currency: "NGN",
  frequency: "MONTHLY",
  status: "FORMING",
  totalSlots: 5,
  createdAt: new Date().toISOString(), // Returns ISO string from backend
  myRole: "CREATOR",
  myStatus: "ACTIVE",
  filledSlots: 1,
}

const mockDetailCircle = {
  ...mockCircle,
  startDeadline: new Date(Date.now() + 86400000).toISOString(),
  members: [
    {
      user: {
        id: "user-1",
        name: "Test User",
        username: "testuser",
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
  expiresAt: new Date(Date.now() + 86400000).toISOString(), // Returns ISO string
}

const server = setupServer(
  http.get("*/api/circles", () => {
    return HttpResponse.json([mockCircle])
  }),
  http.get("*/api/circles/:id", () => {
    return HttpResponse.json(mockDetailCircle)
  }),
  http.get("*/api/invites", () => {
    return HttpResponse.json([mockInvite])
  }),
  http.post("*/api/circles", () => {
    return HttpResponse.json({ id: "circle-999" }, { status: 201 })
  }),
  http.post("*/api/invites/:id/accept", () => {
    return HttpResponse.json({ success: true })
  })
)

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("Circles API Data Wrappers", () => {
  it("fetchMyCircles validates and parses ISO date strings to Date objects or strings", async () => {
    const data = await fetchMyCircles()
    expect(data).toHaveLength(1)
    expect(data[0]?.id).toBe("circle-123")
    // Zod date().or(string()) will allow ISO strings directly.
    expect(data[0]?.createdAt).toBeDefined()
  })

  it("fetchCircle validates detail schema including members and invites", async () => {
    const data = await fetchCircle("circle-123")
    expect(data.id).toBe("circle-123")
    expect(data.members).toHaveLength(1)
    expect(data.startDeadline).toBeDefined()
  })

  it("fetchMyInvites parses expiresAt properly", async () => {
    const data = await fetchMyInvites()
    expect(data).toHaveLength(1)
    expect(data[0]?.status).toBe("PENDING")
    expect(data[0]?.expiresAt).toBeDefined()
  })

  it("createCircle wrapper calls endpoint and returns id", async () => {
    const data = await createCircle({
      name: "New",
      contributionMinor: 100000,
      frequency: "WEEKLY",
      totalSlots: 2,
      startDeadline: new Date(Date.now() + 100000),
    })
    expect(data.id).toBe("circle-999")
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useRealtimeInvalidation } from "./use-realtime-invalidation"
import { useNotifications } from "@/features/notifications/queries/use-notifications"
import { CIRCLE_QUERY_KEYS } from "@/features/circles/queries"

vi.mock("@/features/notifications/queries/use-notifications", () => ({
  useNotifications: vi.fn(),
}))

function notification(id: string, type: string) {
  return {
    id,
    type,
    title: "t",
    body: "b",
    link: null,
    metadata: null,
    readAt: null,
    createdAt: new Date().toISOString(),
  }
}

function setup(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useRealtimeInvalidation(), { wrapper })
}

describe("useRealtimeInvalidation", () => {
  let client: QueryClient
  let invalidateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    invalidateSpy = vi.spyOn(client, "invalidateQueries")
  })

  it("does not invalidate on first render (only reacts to notifications that arrive after mount)", () => {
    vi.mocked(useNotifications).mockReturnValue({
      items: [notification("n1", "PAYOUT_RECEIVED")],
    } as never)

    setup(client)

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("invalidates circle + transaction keys when a new PAYOUT_* notification appears", () => {
    vi.mocked(useNotifications).mockReturnValue({
      items: [notification("n1", "PAYOUT_RECEIVED")],
    } as never)

    const { rerender } = setup(client)
    invalidateSpy.mockClear()

    vi.mocked(useNotifications).mockReturnValue({
      items: [notification("n2", "PAYOUT_RECEIVED"), notification("n1", "PAYOUT_RECEIVED")],
    } as never)
    rerender()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: CIRCLE_QUERY_KEYS.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["transactions"] })
  })

  it("invalidates circle + transaction keys when a new CONTRIBUTION_* notification appears", () => {
    vi.mocked(useNotifications).mockReturnValue({
      items: [notification("n1", "CONTRIBUTION_RECEIVED")],
    } as never)

    const { rerender } = setup(client)
    invalidateSpy.mockClear()

    vi.mocked(useNotifications).mockReturnValue({
      items: [
        notification("n2", "CONTRIBUTION_RECEIVED"),
        notification("n1", "CONTRIBUTION_RECEIVED"),
      ],
    } as never)
    rerender()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: CIRCLE_QUERY_KEYS.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["transactions"] })
  })

  it("does not invalidate for a default/unmapped notification type", () => {
    vi.mocked(useNotifications).mockReturnValue({
      items: [notification("n1", "WELCOME")],
    } as never)

    const { rerender } = setup(client)
    invalidateSpy.mockClear()

    vi.mocked(useNotifications).mockReturnValue({
      items: [notification("n2", "WELCOME"), notification("n1", "WELCOME")],
    } as never)
    rerender()

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("does not re-invalidate when the newest id hasn't changed", () => {
    vi.mocked(useNotifications).mockReturnValue({
      items: [notification("n1", "PAYOUT_RECEIVED")],
    } as never)

    const { rerender } = setup(client)
    invalidateSpy.mockClear()

    // Same items, same newest id — a re-render with no new notification.
    rerender()

    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

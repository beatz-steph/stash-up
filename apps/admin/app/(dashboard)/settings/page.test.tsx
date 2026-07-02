import { describe, it, expect, vi } from "vitest"
import SettingsPage from "./page"
import { requireSuperAdmin } from "@/lib/access-control"

// We need to mock next/navigation to catch the redirect
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url) => {
    throw new Error(`REDIRECT_TO_${url}`) // Simple way to test redirect threw
  }),
}))

vi.mock("@/lib/access-control", () => ({
  requireSuperAdmin: vi.fn(),
}))

vi.mock("@/features/settings/components/config-card", () => ({
  ConfigCard: () => <div data-testid="config-card" />
}))

describe("SettingsPage", () => {
  it("redirects SUPPORT users to dashboard", async () => {
    // Mock the guard to return an error (which happens when role !== SUPER_ADMIN)
    vi.mocked(requireSuperAdmin).mockResolvedValueOnce({
      session: null as never,
      error: new Response("Forbidden", { status: 403 }) as never,
    })

    // Calling the async page component
    await expect(SettingsPage()).rejects.toThrowError("REDIRECT_TO_/")
  })

  it("renders page for SUPER_ADMIN", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValueOnce({
      session: { user: { role: "SUPER_ADMIN" } } as never,
      error: null,
    })

    const result = await SettingsPage()
    
    // Ensure it returned the JSX (not throwing a redirect)
    expect(result).toBeTruthy()
    expect(result.props.children[0].props.children[0].props.children).toBe("Settings")
  })
})

import type { getSession } from "../../apps/web/lib/session"

/** The session shape returned by `getSession()` / `auth.api.getSession()`. */
export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>

/**
 * Creates a type-safe mock session for use in tests.
 * Overrides are applied to the `user` object.
 *
 * Usage:
 *   vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "user-1" }))
 */
export function createMockSession(overrides: Partial<Session["user"]> = {}): Session {
  return {
    session: {
      id: "session-123",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: overrides.id ?? "user-123",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      token: "mock-token",
    },
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      username: "testuser",
      displayUsername: "testuser",
      firstName: "Test",
      lastName: "User",
      phone: null,
      lifetimeDefaultCount: 0,
      blockedFromCircles: false,
      ...overrides,
    },
  } as Session
}

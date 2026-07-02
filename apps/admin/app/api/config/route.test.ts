import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"
import { prisma } from "@workspace/db"
import { requireSuperAdmin } from "@/lib/access-control"

vi.mock("@workspace/db", () => ({
  prisma: {
    nombaConfig: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock("@/lib/access-control", () => ({
  requireSuperAdmin: vi.fn(),
}))

describe("GET /api/config", () => {
  it("should return 403 if user is not SUPER_ADMIN", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValueOnce({
      session: null as never,
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never,
    })

    const response = await GET()
    expect(response.status).toBe(403)
  })

  it("should omit secret keys and mask clientId in the response", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValueOnce({
      session: { user: { role: "SUPER_ADMIN" } } as never,
      error: null,
    })

    vi.mocked(prisma.nombaConfig.findFirst).mockResolvedValueOnce({
      id: "config-1",
      provider: "NOMBA",
      clientId: "test_client_id_123",
      clientSecretCipher: "SECRET123",
      webhookSecretCipher: "WEBHOOK123",
      baseUrl: "https://api.nomba.com",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const response = await GET()
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.clientId).toBe("test••••_123")
    expect(data).not.toHaveProperty("clientSecretCipher")
    expect(data).not.toHaveProperty("webhookSecretCipher")
    expect(data.baseUrl).toBe("https://api.nomba.com")
  })
})

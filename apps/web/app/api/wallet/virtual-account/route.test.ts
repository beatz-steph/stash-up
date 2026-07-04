import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { getSession } from "@/lib/session";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { ensureWalletVirtualAccount } from "@/lib/wallet/provision";
import { createMockSession } from "@test/mocks/auth";

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/nomba-config", () => ({ isNombaIntegrationDisabled: vi.fn() }));
vi.mock("@/lib/wallet/provision", () => ({ ensureWalletVirtualAccount: vi.fn() }));

const VA = {
  bankAccountNumber: "1234567890",
  bankAccountName: "StashUp Wallet Test User",
  bankName: "Nombank MFB",
};

describe("POST /api/wallet/virtual-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(false);
    vi.mocked(ensureWalletVirtualAccount).mockResolvedValue(VA);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 when the email is unverified", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1", emailVerified: false }));
    const res = await POST();
    expect(res.status).toBe(403);
    expect(ensureWalletVirtualAccount).not.toHaveBeenCalled();
  });

  it("returns 503 when Nomba is disabled", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    vi.mocked(isNombaIntegrationDisabled).mockResolvedValue(true);
    const res = await POST();
    expect(res.status).toBe(503);
  });

  it("provisions and returns the top-up account", async () => {
    vi.mocked(getSession).mockResolvedValue(createMockSession({ id: "u1" }));
    const res = await POST();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toEqual(VA);
    expect(ensureWalletVirtualAccount).toHaveBeenCalledWith("u1");
  });
});

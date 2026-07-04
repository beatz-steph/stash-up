import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { requireVerifiedEmail } from "@/lib/access-control";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { ensureWalletVirtualAccount } from "@/lib/wallet/provision";
import type { WalletVirtualAccountRes } from "../dto/wallet.dto";

/** POST /api/wallet/virtual-account — provision (or return) the user's
 * dedicated bank top-up account. Called when they open the top-up view. */
export async function POST() {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  try {
    requireVerifiedEmail(session.user);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  if (await isNombaIntegrationDisabled()) {
    return apiError("Wallet top-up is temporarily unavailable", 503);
  }

  try {
    const va = await ensureWalletVirtualAccount(session.user.id);
    return apiSuccess<WalletVirtualAccountRes>(va);
  } catch (err) {
    console.error(
      "[wallet/virtual-account] provisioning failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Could not set up your top-up account. Please try again.", 502);
  }
}

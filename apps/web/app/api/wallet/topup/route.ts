import { randomUUID } from "node:crypto";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { requireVerifiedEmail } from "@/lib/access-control";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { createCheckoutOrder } from "@/lib/nomba-client";
import { grossUpForCardFee, cardFeeOn } from "@/lib/fees";
import { checkoutCallbackUrl } from "@/lib/cards/enrollment";
import { WalletTopupReqSchema, type WalletTopupRes } from "../dto/wallet.dto";

/**
 * Start a card top-up. The user is charged `amountMinor + card fee` so the full
 * `amountMinor` lands in their wallet after Nomba's cut. Settlement credits the
 * NET actually received (Stage 3 webhook). Returns a hosted-checkout link.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  try {
    requireVerifiedEmail(session.user);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = WalletTopupReqSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Enter an amount of at least ₦100", 422);
  }

  if (await isNombaIntegrationDisabled()) {
    return apiError("Wallet top-up is temporarily unavailable", 503);
  }

  const userId = session.user.id;
  const netMinor = parsed.data.amountMinor;
  const feeMinor = cardFeeOn(netMinor);
  const chargedMinor = grossUpForCardFee(netMinor);
  const orderReference = `wallettopup_${userId}_${randomUUID()}`;

  try {
    const order = await createCheckoutOrder({
      orderReference,
      customerEmail: session.user.email,
      amountMinor: chargedMinor,
      callbackUrl: checkoutCallbackUrl(),
      tokenizeCard: false, // one-off top-up; not saving the card
      metadata: { kind: "wallettopup", userId, netMinor: String(netMinor) },
    });

    return apiSuccess<WalletTopupRes>({
      checkoutLink: order.checkoutLink,
      netMinor,
      feeMinor,
      chargedMinor,
    });
  } catch (err) {
    console.error(
      "[wallet/topup] checkout order failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Could not start the top-up. Please try again.", 502);
  }
}

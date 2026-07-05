import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { requireVerifiedEmail } from "@/lib/access-control";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { createCheckoutOrder } from "@/lib/nomba-client";
import { grossUpForCardFee, cardFeeOn } from "@/lib/fees";
import { walletTopupCallbackUrl, orderNonce } from "@/lib/cards/enrollment";
import { WalletTopupReqSchema, type WalletTopupRes } from "../dto/wallet.dto";

/**
 * Start a card top-up via a one-time Nomba hosted checkout — cards are never
 * saved on this account, so there's a single path: a card-only checkout link
 * the user is redirected to. They're charged `amountMinor + card fee` so the
 * full `amountMinor` lands in their wallet after Nomba's cut; the settlement
 * webhook (handleWalletCardTopup) credits the NET actually received.
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
  const { amountMinor: netMinor } = parsed.data;
  const feeMinor = cardFeeOn(netMinor);
  const chargedMinor = grossUpForCardFee(netMinor);
  // Short ref — Nomba caps orderReference at 50 chars. The userId + netMinor
  // ride in orderMetaData, which is how the settlement webhook routes/credits.
  const orderReference = `wallettopup_${orderNonce()}`;
  const metadata = { kind: "wallettopup", userId, netMinor: String(netMinor) };

  try {
    const order = await createCheckoutOrder({
      orderReference,
      customerEmail: session.user.email,
      amountMinor: chargedMinor,
      callbackUrl: walletTopupCallbackUrl(),
      // One-time card payment: never tokenize, but keep the checkout card-only
      // (a Transfer/USSD payment would credit the wallet too, but the top-up UI
      // is explicitly "by card" — bank transfer is a separate tab/VA).
      tokenizeCard: false,
      allowedPaymentMethods: ["Card"],
      metadata,
    });

    return apiSuccess<WalletTopupRes>({
      mode: "checkout",
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

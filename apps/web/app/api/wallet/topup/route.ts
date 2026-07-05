import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { requireVerifiedEmail } from "@/lib/access-control";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";
import { prisma } from "@workspace/db";
import { createCheckoutOrder, chargeTokenizedCard } from "@/lib/nomba-client";
import { grossUpForCardFee, cardFeeOn } from "@/lib/fees";
import { walletTopupCallbackUrl, orderNonce, isUsableCardToken } from "@/lib/cards/enrollment";
import { WalletTopupReqSchema, type WalletTopupRes } from "../dto/wallet.dto";

/**
 * Start a card top-up. The user is charged `amountMinor + card fee` so the full
 * `amountMinor` lands in their wallet after Nomba's cut. Settlement credits the
 * NET actually received (handleWalletCardTopup webhook). Two paths:
 *  - savedCardId present → charge the tokenized card server-side ("charged").
 *  - omitted → hosted-checkout link for a new card ("checkout").
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
  const { amountMinor: netMinor, savedCardId } = parsed.data;
  const feeMinor = cardFeeOn(netMinor);
  const chargedMinor = grossUpForCardFee(netMinor);
  // Short ref — Nomba caps orderReference at 50 chars. The userId + netMinor
  // ride in orderMetaData, which is how the settlement webhook routes/credits.
  const orderReference = `wallettopup_${orderNonce()}`;
  const metadata = { kind: "wallettopup", userId, netMinor: String(netMinor) };

  // ── Saved-card path: charge the tokenized card server-side ──
  if (savedCardId) {
    const card = await prisma.savedCard.findUnique({
      where: { id: savedCardId },
      select: { userId: true, status: true, tokenKey: true },
    });
    if (!card || card.userId !== userId) {
      return apiError("Card not found", 404);
    }
    if (card.status !== "ACTIVE") {
      return apiError("That card is no longer usable. Add a new card.", 409);
    }
    // A placeholder token (Nomba returned "N/A" — the card was never really
    // tokenized) can't be charged offline: it would OTP-prompt and never debit.
    // Retire it so it stops being offered, and ask the user to re-add the card.
    if (!isUsableCardToken(card.tokenKey)) {
      await prisma.savedCard.update({ where: { id: savedCardId }, data: { status: "EXPIRED" } });
      return apiError("That saved card can't be charged automatically. Please add it again.", 409);
    }

    // Durable record BEFORE the charge — this is what lets the verify sweep
    // reconcile the top-up if Nomba's settlement webhook never reaches us.
    const attempt = await prisma.chargeAttempt.create({
      data: {
        userId,
        savedCardId,
        purpose: "TOPUP",
        amountMinor: chargedMinor,
        orderReference,
        attemptNumber: 0,
        status: "PENDING",
      },
    });

    try {
      await chargeTokenizedCard({
        orderReference,
        customerEmail: session.user.email,
        amountMinor: chargedMinor,
        tokenKey: card.tokenKey,
        metadata,
      });
    } catch (err) {
      console.error(
        "[wallet/topup] tokenized charge failed:",
        err instanceof Error ? err.message : err
      );
      await prisma.chargeAttempt.update({
        where: { id: attempt.id },
        data: { status: "FAILED", failureReason: "charge_request_failed" },
      });
      return apiError("Could not charge that card. Please try again.", 502);
    }

    return apiSuccess<WalletTopupRes>({
      mode: "charged",
      checkoutLink: null,
      netMinor,
      feeMinor,
      chargedMinor,
    });
  }

  // ── New-card path: hosted checkout ──
  try {
    const order = await createCheckoutOrder({
      orderReference,
      customerEmail: session.user.email,
      amountMinor: chargedMinor,
      callbackUrl: walletTopupCallbackUrl(),
      // Tokenize: restricts the hosted checkout to card-only (a transfer/USSD
      // payment would credit the wallet but leave no card) AND saves the card
      // on settlement so the next top-up is one tap.
      tokenizeCard: true,
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

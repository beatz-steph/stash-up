import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { requireVerifiedEmail } from "@/lib/access-control";
import {
  hasWalletPin,
  setWalletPin,
  verifyWalletPin,
  isValidPinFormat,
} from "@/lib/wallet/pin";

/** GET /api/wallet/pin — whether a transaction PIN is set. */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return apiError("Unauthorized", 401);
  const isSet = await hasWalletPin(session.user.id);
  return apiSuccess({ isSet });
}

/** POST /api/wallet/pin { pin } — set the PIN for the first time. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return apiError("Unauthorized", 401);
  try {
    requireVerifiedEmail(session.user);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  const body = await req.json().catch(() => ({}));
  if (!isValidPinFormat((body as { pin?: unknown }).pin)) {
    return apiError("PIN must be 4–6 digits", 422);
  }
  if (await hasWalletPin(session.user.id)) {
    return apiError("A PIN is already set. Use change PIN instead.", 409);
  }

  await setWalletPin(session.user.id, (body as { pin: string }).pin);
  return apiSuccess({ isSet: true });
}

/** PUT /api/wallet/pin { currentPin, newPin } — change the PIN. */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session?.user) return apiError("Unauthorized", 401);

  const body = (await req.json().catch(() => ({}))) as {
    currentPin?: unknown;
    newPin?: unknown;
  };
  if (!isValidPinFormat(body.newPin)) {
    return apiError("New PIN must be 4–6 digits", 422);
  }
  if (typeof body.currentPin !== "string") {
    return apiError("Current PIN is required", 422);
  }

  const verify = await verifyWalletPin(session.user.id, body.currentPin);
  if (!verify.ok) {
    if (verify.reason === "no_pin") return apiError("No PIN set yet", 409);
    if (verify.reason === "locked") {
      return apiError("Too many attempts. Try again later.", 423);
    }
    return apiError("Current PIN is incorrect", 403);
  }

  await setWalletPin(session.user.id, body.newPin);
  return apiSuccess({ isSet: true });
}

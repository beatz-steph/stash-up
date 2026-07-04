import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import type { WalletRes } from "./dto/wallet.dto";

const LEDGER_PAGE = 20;

/** GET /api/wallet — the user's wallet balance, top-up VA (if provisioned),
 * and recent ledger activity. Creates the wallet on first read (balance 0). */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }
  const userId = session.user.id;

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId },
    select: {
      balanceMinor: true,
      virtualAccount: {
        select: { bankAccountNumber: true, bankAccountName: true, bankName: true },
      },
      entries: {
        orderBy: { createdAt: "desc" },
        take: LEDGER_PAGE,
        select: {
          id: true,
          direction: true,
          amountMinor: true,
          balanceAfterMinor: true,
          source: true,
          reference: true,
          createdAt: true,
        },
      },
    },
  });

  const res: WalletRes = {
    balanceMinor: wallet?.balanceMinor ?? 0,
    virtualAccount: wallet?.virtualAccount ?? null,
    entries: (wallet?.entries ?? []).map((e) => ({
      id: e.id,
      direction: e.direction,
      amountMinor: e.amountMinor,
      balanceAfterMinor: e.balanceAfterMinor,
      source: e.source,
      reference: e.reference,
      createdAt: e.createdAt.toISOString(),
    })),
  };

  return apiSuccess<WalletRes>(res);
}

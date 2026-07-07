import { NextResponse } from "next/server";
import { prisma, Prisma } from "@workspace/db";
import { apiError, apiSuccess } from "@/lib/api/response";
import { getCheckoutTransactionById } from "@/lib/nomba-client";
import { creditWallet } from "@/lib/wallet/ledger";
import { z } from "zod";

const reqSchema = z.object({
  orphanId: z.string(),
  adminUserId: z.string(),
  note: z.string().optional().nullable(),
});

/**
 * Internal route for resolving orphans into a global wallet. Called by the Admin app.
 *
 * For an orphan without a VA (e.g. online_checkout), we fetch the Nomba transaction
 * payload to get the customer's email. We then look up the user by email and
 * credit their general wallet.
 * 
 * For an orphan tied to a WALLET Virtual Account (e.g. vact_transfer with no membership),
 * we directly credit the owning user's wallet.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized", debug: { authHeader, cronSecret } }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = reqSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid request schema", 400);
  }

  const { orphanId, adminUserId, note } = parsed.data;

  const orphan = await prisma.orphanTransaction.findUnique({
    where: { id: orphanId },
    include: { virtualAccount: true },
  });

  if (!orphan) return apiError("Orphan not found", 404);
  if (orphan.status !== "PENDING") return apiError("Orphan is not pending", 409);

  let userIdToCredit: string | null = null;
  let customerEmail: string | null = null;
  let source: "TOPUP_CARD" | "TOPUP_BANK" = "TOPUP_CARD";
  let fallbackSenderName = orphan.senderName;

  if (orphan.txType === "online_checkout") {
    // 1a. Fetch Nomba payload to get email
    try {
      const tx = await getCheckoutTransactionById(orphan.nombaTransactionId);
      customerEmail = tx.customerEmail;
    } catch (e) {
      console.error("[resolve-wallet-orphan] failed to fetch nomba tx:", e);
      // We don't fail immediately because we might be able to extract it from the orphan record
    }

    if (!customerEmail) {
      // Fallback: try to extract email from the orphan record itself since the user might see it
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      const senderMatch = orphan.senderName?.match(emailRegex);
      const narrationMatch = orphan.narration?.match(emailRegex);
      
      if (senderMatch) {
        customerEmail = senderMatch[0];
      } else if (narrationMatch) {
        customerEmail = narrationMatch[0];
      }
    }

    if (!customerEmail) {
      return apiError("Nomba transaction record does not contain a customer email and no email was found in the orphan details", 404);
    }

    // 2a. Find User by Email
    const user = await prisma.user.findUnique({
      where: { email: customerEmail },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return apiError(`No StashUp user found for email: ${customerEmail}`, 404);
    }
    userIdToCredit = user.id;
    fallbackSenderName = fallbackSenderName ?? user.name;
    source = "TOPUP_CARD";
  } else if (orphan.txType === "vact_transfer") {
    // 1b. Validate it's a WALLET VA
    if (!orphan.virtualAccountId || !orphan.virtualAccount) {
      return apiError("No virtual account linked to this VA transfer orphan", 400);
    }
    if (orphan.virtualAccount.kind !== "WALLET" || !orphan.virtualAccount.userId) {
      return apiError("The linked virtual account is not a personal wallet VA", 400);
    }
    userIdToCredit = orphan.virtualAccount.userId;
    source = "TOPUP_BANK";
  } else {
    return apiError("Orphan is not a supported type for wallet resolution", 400);
  }

  if (!userIdToCredit) {
    return apiError("Failed to determine user to credit", 500);
  }

  // 3. Resolve & Credit Wallet
  try {
    const applied = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Re-check PENDING
      const fresh = await tx.orphanTransaction.findUnique({
        where: { id: orphanId },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "PENDING") {
        throw new Error("ORPHAN_NOT_PENDING");
      }

      // Credit the wallet (idempotent, ledger-backed)
      const walletRes = await creditWallet(tx, {
        userId: userIdToCredit!,
        amountMinor: orphan.amountMinor,
        source: source,
        idempotencyKey: `orphan_resolve_${orphanId}`,
      });

      // Create an InboundTransfer record for traceability
      const inbound = await tx.inboundTransfer.create({
        data: {
          provider: "NOMBA",
          source: orphan.txType === "online_checkout" ? "CARD" : "TRANSFER",
          providerEventId: `orphan_${orphan.id}`, // synthetic
          nombaTransactionId: orphan.nombaTransactionId,
          virtualAccountId: orphan.virtualAccountId,
          amountMinor: orphan.amountMinor,
          currency: orphan.currency,
          senderName: fallbackSenderName ?? "Unknown",
          narration: orphan.narration ?? "Orphan resolved to wallet",
          matchStatus: "MANUAL",
          receivedAt: orphan.transactionAt,
        },
      });

      // Update Orphan
      await tx.orphanTransaction.update({
        where: { id: orphanId },
        data: {
          status: "RESOLVED",
          inboundTransferId: inbound.id,
          resolvedByAdminId: adminUserId,
          resolvedAt: new Date(),
          resolutionNote: note ?? null,
        },
      });

      return { balanceAfterMinor: walletRes.balanceAfterMinor };
    });

    return apiSuccess({
      id: orphanId,
      status: "RESOLVED",
      customerEmail,
      walletCredited: true,
      balanceAfterMinor: applied.balanceAfterMinor,
    });
  } catch (e) {
    if ((e as Error).message === "ORPHAN_NOT_PENDING") {
      return apiError("Orphan already resolved", 409);
    }
    throw e;
  }
}

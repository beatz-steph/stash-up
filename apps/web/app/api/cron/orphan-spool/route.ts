import { prisma } from "@workspace/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { listSubAccountTransactions, nairaToKobo } from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";

// Transaction types that represent money entering the sub-account.
const CREDIT_TYPES = new Set(["vact_transfer", "online_checkout", "purchase", "qrt_credit"]);

// Transaction types that represent money leaving (outbound) — skip these.
const DEBIT_TYPES = new Set(["withdrawal", "transfer", "p2p"]);

/**
 * Orphan spool: pull ALL transactions from Nomba's sub-account feed and record
 * any successful credits we have no InboundTransfer or ChargeAttempt for (a
 * missed/undelivered webhook). Covers both VA bank transfers AND card checkout
 * payments. Triggered on an interval by an external scheduler with CRON_SECRET.
 *
 * Idempotent: dedups against existing InboundTransfer (by nombaTransactionId),
 * ChargeAttempt (by orderReference/merchantTxRef), existing OrphanTransaction
 * rows, and the OrphanTransaction.nombaTransactionId unique constraint.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return apiError("Unauthorized", 401);
  }

  if (await isNombaIntegrationDisabled()) {
    return apiError("Nomba integration is disabled", 503);
  }

  // ── 1. Fetch ALL transactions from Nomba's sub-account feed ──
  let allTx;
  try {
    allTx = await listSubAccountTransactions();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[orphan-spool] listSubAccountTransactions failed:", msg);
    return apiError(`List failed: ${msg}`, 502);
  }

  // ── 2. Filter to successful credits only ──
  const credits = allTx.filter((tx) => {
    if (tx.status !== "SUCCESS") return false;
    const type = tx.type ?? "";
    if (DEBIT_TYPES.has(type)) return false;
    // Accept known credit types, and also accept unknown types that aren't debits
    // (defensive: Nomba may add new credit types)
    return CREDIT_TYPES.has(type) || !DEBIT_TYPES.has(type);
  });

  if (credits.length === 0) {
    return apiSuccess({
      totalFromNomba: allTx.length,
      creditsSeen: 0,
      orphansInserted: 0,
      outboundSkipped: allTx.length,
    });
  }

  // ── 3. Build dedup sets from our DB ──
  const [existingInbound, existingChargeAttempts, existingOrphans] = await Promise.all([
    prisma.inboundTransfer.findMany({
      select: { nombaTransactionId: true },
    }),
    prisma.chargeAttempt.findMany({
      where: { status: "SUCCESS" },
      select: { orderReference: true, nombaTransactionId: true },
    }),
    prisma.orphanTransaction.findMany({
      select: { nombaTransactionId: true },
    }),
  ]);

  const inboundTxIds = new Set(existingInbound.map((t) => t.nombaTransactionId));
  const chargeOrderRefs = new Set(existingChargeAttempts.map((c) => c.orderReference));
  const chargeNombaTxIds = new Set(
    existingChargeAttempts
      .map((c) => c.nombaTransactionId)
      .filter((id): id is string => id != null)
  );
  const orphanTxIds = new Set(existingOrphans.map((o) => o.nombaTransactionId));

  // ── 3.5 Look up Virtual Accounts for these transactions ──
  // If we have VAs in the payload, let's map them so we can link orphans to the correct VA and Member!
  const accountNumbers = Array.from(
    new Set(credits.map((c) => c.recipientAccountNumber).filter((n): n is string => Boolean(n)))
  );
  
  const vactRecords = accountNumbers.length > 0 
    ? await prisma.virtualAccount.findMany({
        where: { bankAccountNumber: { in: accountNumbers } },
        select: { id: true, bankAccountNumber: true },
      })
    : [];
    
  const vaMap = new Map(vactRecords.map((va) => [va.bankAccountNumber, va.id]));

  // ── 4. Insert orphans for unmatched credits ──
  let orphansInserted = 0;

  for (const credit of credits) {
    // Skip if already recorded via webhook (InboundTransfer)
    if (inboundTxIds.has(credit.id)) continue;

    // Skip if card checkout already settled (ChargeAttempt)
    if (credit.merchantTxRef && chargeOrderRefs.has(credit.merchantTxRef)) continue;
    if (chargeNombaTxIds.has(credit.id)) continue;

    // Skip if already spooled as orphan
    if (orphanTxIds.has(credit.id)) continue;

    const amountMinor = nairaToKobo(credit.amount);
    const at = new Date(credit.timeCreated);
    
    // Resolve VA if present
    const vaId = credit.recipientAccountNumber 
      ? vaMap.get(credit.recipientAccountNumber) ?? null 
      : null;

    try {
      await prisma.orphanTransaction.create({
        data: {
          nombaTransactionId: credit.id,
          virtualAccountId: vaId,
          amountMinor,
          entryType: (credit as any).entryType ?? "CREDIT",
          txType: credit.type ?? null,
          senderName: (credit as any).senderName ?? credit.source ?? "Unknown Sender",
          narration: credit.gatewayMessage ?? (credit as any).narration ?? null,
          sessionId: credit.merchantTxRef ?? credit.rrn ?? credit.posTid ?? null,
          transactionAt: at,
        },
      });
      orphanTxIds.add(credit.id); // prevent double-insert within this run
      orphansInserted++;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") continue; // raced, already inserted
      throw err;
    }
  }

  const outboundSkipped = allTx.length - credits.length;

  return apiSuccess({
    totalFromNomba: allTx.length,
    creditsSeen: credits.length,
    orphansInserted,
    outboundSkipped,
  });
}

import { prisma } from "@workspace/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { listVirtualAccountTransactions, nairaToKobo } from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";

// Second-granularity key for the amount+timestamp dedup fallback (in case the
// list endpoint's `id` doesn't match the webhook's stored nombaTransactionId).
function amountTimeKey(amountMinor: number, at: Date): string {
  return `${amountMinor}|${Math.floor(at.getTime() / 1000)}`;
}

/**
 * Orphan spool: pull recent CREDITs from Nomba's virtual-account transaction
 * history for every provisioned VA and record any we have no InboundTransfer
 * for (a missed/undelivered webhook). Triggered on an interval by an external
 * scheduler (Railway) with the CRON_SECRET bearer.
 *
 * Idempotent: dedups against existing InboundTransfer (by nombaTransactionId,
 * with an amount+timestamp fallback) and existing OrphanTransaction rows, and
 * the OrphanTransaction.nombaTransactionId unique constraint backstops races.
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

  // Window: last N hours (default 48). Generous overlap is fine — dedup handles it.
  const url = new URL(request.url);
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 48, 1), 168);
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  // Only CIRCLE VAs: orphans are unattributed CONTRIBUTIONS, and the admin
  // replay assumes a membership. WALLET VAs (top-ups) are out of scope here —
  // a missed wallet top-up is recovered via Nomba dashboard re-push (v1).
  const vas = await prisma.virtualAccount.findMany({
    where: { status: "ACTIVE", kind: "CIRCLE" },
    select: { id: true, bankAccountNumber: true },
  });

  let creditsSeen = 0;
  let orphansInserted = 0;
  const errors: string[] = [];

  for (const va of vas) {
    let rows;
    try {
      rows = await listVirtualAccountTransactions({
        virtualAccount: va.bankAccountNumber,
        from: fromIso,
        to: toIso,
      });
    } catch (err) {
      // Don't let one VA's failure abort the whole sweep.
      errors.push(va.id);
      console.error(
        `[orphan-spool] list failed for VA ${va.id}:`,
        err instanceof Error ? err.message : err
      );
      continue;
    }

    const credits = rows.filter(
      (r) => (r.entryType ?? "").toUpperCase() === "CREDIT" && r.status === "SUCCESS"
    );
    if (credits.length === 0) continue;
    creditsSeen += credits.length;

    const [existingInbound, existingOrphans] = await Promise.all([
      prisma.inboundTransfer.findMany({
        where: { virtualAccountId: va.id },
        select: { nombaTransactionId: true, amountMinor: true, receivedAt: true },
      }),
      prisma.orphanTransaction.findMany({
        where: { virtualAccountId: va.id },
        select: { nombaTransactionId: true },
      }),
    ]);

    const inboundIds = new Set(existingInbound.map((t) => t.nombaTransactionId));
    const inboundAmtTime = new Set(
      existingInbound.map((t) => amountTimeKey(t.amountMinor, t.receivedAt))
    );
    const orphanIds = new Set(existingOrphans.map((o) => o.nombaTransactionId));

    for (const credit of credits) {
      const amountMinor = nairaToKobo(credit.amount);
      const at = new Date(credit.timeCreated);

      if (inboundIds.has(credit.id)) continue; // recorded via webhook (id match)
      if (inboundAmtTime.has(amountTimeKey(amountMinor, at))) continue; // fallback match
      if (orphanIds.has(credit.id)) continue; // already spooled

      try {
        await prisma.orphanTransaction.create({
          data: {
            nombaTransactionId: credit.id,
            virtualAccountId: va.id,
            amountMinor,
            entryType: (credit.entryType ?? "CREDIT").toUpperCase(),
            txType: credit.type ?? null,
            senderName: credit.senderName ?? null,
            narration: credit.narration ?? null,
            sessionId: credit.sessionId ?? null,
            transactionAt: at,
          },
        });
        orphanIds.add(credit.id);
        orphansInserted++;
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") continue; // raced, already inserted
        throw err;
      }
    }
  }

  return apiSuccess({
    window: { from: fromIso, to: toIso },
    virtualAccountsScanned: vas.length,
    creditsSeen,
    orphansInserted,
    listErrors: errors.length,
  });
}

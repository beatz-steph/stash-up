import { prisma } from "@workspace/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getSubAccountBalance } from "@/lib/nomba-client";
import { isNombaIntegrationDisabled } from "@/lib/nomba-config";

// A payout/withdrawal still INITIATED (or PENDING_BILLING) this long after
// creation is stuck — Nomba never confirmed it, so it needs a human look.
const STUCK_AFTER_MS = 30 * 60 * 1000;

/**
 * Nightly reconciliation — compares Nomba's sub-account (the pooled treasury)
 * against our ledger and surfaces anything that needs a human.
 *
 * Treasury identity: everything that lands in the sub-account is recorded as an
 * `InboundTransfer` (contributions + wallet top-ups, net of provider fees), and
 * everything that leaves is a `Payout` or `WalletWithdrawal` (amount + fee). So:
 *
 *   expected sub-account balance = Σ inbound − Σ settled payouts − Σ settled withdrawals
 *
 * We fetch Nomba's live balance and report the drift, alongside the outbound
 * still in flight (which explains benign drift) and any stuck/unmatched rows.
 * Read-only — this NEVER mutates money; it reports. Complements orphan-spool
 * (missed inbound webhooks) and webhook-replay (missed event recovery).
 *
 * Triggered on a nightly schedule by the external scheduler with the CRON_SECRET
 * bearer. Emits one structured `{ tag: "recon" }` log line for the audit trail.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return apiError("Unauthorized", 401);
  }

  const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS);

  const [
    inboundAgg,
    payoutSettled,
    withdrawalSettled,
    payoutInFlight,
    withdrawalInFlight,
    stuckPayouts,
    stuckWithdrawals,
    unmatchedInbound,
  ] = await Promise.all([
    prisma.inboundTransfer.aggregate({ _sum: { amountMinor: true } }),
    prisma.payout.aggregate({ where: { status: "SUCCESS" }, _sum: { amountMinor: true, feeMinor: true } }),
    prisma.walletWithdrawal.aggregate({ where: { status: "SUCCESS" }, _sum: { amountMinor: true, feeMinor: true } }),
    prisma.payout.aggregate({
      where: { status: { in: ["INITIATED", "PENDING_BILLING"] } },
      _sum: { amountMinor: true, feeMinor: true },
    }),
    prisma.walletWithdrawal.aggregate({
      where: { status: "INITIATED" },
      _sum: { amountMinor: true, feeMinor: true },
    }),
    prisma.payout.count({
      where: { status: { in: ["INITIATED", "PENDING_BILLING"] }, createdAt: { lt: stuckBefore } },
    }),
    prisma.walletWithdrawal.count({
      where: { status: "INITIATED", createdAt: { lt: stuckBefore } },
    }),
    prisma.inboundTransfer.count({ where: { matchStatus: "UNMATCHED" } }),
  ]);

  const inboundTotalMinor = inboundAgg._sum.amountMinor ?? 0;
  const payoutOutMinor = (payoutSettled._sum.amountMinor ?? 0) + (payoutSettled._sum.feeMinor ?? 0);
  const withdrawalOutMinor =
    (withdrawalSettled._sum.amountMinor ?? 0) + (withdrawalSettled._sum.feeMinor ?? 0);
  const expectedBalanceMinor = inboundTotalMinor - payoutOutMinor - withdrawalOutMinor;
  const outstandingOutboundMinor =
    (payoutInFlight._sum.amountMinor ?? 0) +
    (payoutInFlight._sum.feeMinor ?? 0) +
    (withdrawalInFlight._sum.amountMinor ?? 0) +
    (withdrawalInFlight._sum.feeMinor ?? 0);

  // Nomba's live treasury balance (skipped when the integration is disabled).
  let nombaLedgerBalanceMinor: number | null = null;
  let driftMinor: number | null = null;
  let nombaError: string | null = null;
  if (await isNombaIntegrationDisabled()) {
    nombaError = "integration_disabled";
  } else {
    try {
      const bal = await getSubAccountBalance();
      nombaLedgerBalanceMinor = bal.ledgerBalanceMinor;
      driftMinor = nombaLedgerBalanceMinor - expectedBalanceMinor;
    } catch (err) {
      nombaError = err instanceof Error ? err.message : String(err);
    }
  }

  const attentionItems: string[] = [];
  if (stuckPayouts > 0) attentionItems.push(`${stuckPayouts} stuck payout(s)`);
  if (stuckWithdrawals > 0) attentionItems.push(`${stuckWithdrawals} stuck withdrawal(s)`);
  if (unmatchedInbound > 0) attentionItems.push(`${unmatchedInbound} unmatched inbound transfer(s)`);
  // Drift beyond what in-flight outbound can explain (± ₦1 tolerance) is real.
  if (driftMinor !== null && Math.abs(driftMinor) > outstandingOutboundMinor + 100) {
    attentionItems.push(`balance drift of ${driftMinor} kobo`);
  }

  const report = {
    status: attentionItems.length === 0 && !nombaError ? "ok" : "attention",
    ledger: {
      inboundTotalMinor,
      payoutSettledOutMinor: payoutOutMinor,
      withdrawalSettledOutMinor: withdrawalOutMinor,
      expectedBalanceMinor,
      outstandingOutboundMinor,
    },
    nomba: { ledgerBalanceMinor: nombaLedgerBalanceMinor, driftMinor, error: nombaError },
    attention: { stuckPayouts, stuckWithdrawals, unmatchedInbound, items: attentionItems },
    checkedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify({ tag: "recon", ...report }));
  return apiSuccess(report, 200);
}

"use client"

import { Card, CardContent } from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import {
  Scale,
  Wallet,
  ArrowUpRight,
  RefreshCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { useRunReconciliation } from "../mutations/use-run-reconciliation"
import type { TreasuryReconRes } from "@/app/api/reconciliation/treasury/dto/treasury.dto"

function naira(minor: number | null): string {
  if (minor === null) return "—"
  const sign = minor < 0 ? "-" : ""
  return `${sign}₦${Math.abs(minor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof Scale
  label: string
  value: string
  tone?: "neutral" | "good" | "bad"
}) {
  const valueColor =
    tone === "good" ? "text-su-semantic-up" : tone === "bad" ? "text-su-semantic-down" : "text-su-ink"
  return (
    <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
      <CardContent className="space-y-1 py-4">
        <div className="flex items-center gap-2 text-su-muted">
          <Icon className="h-4 w-4" />
          <span className="font-su-sans text-su-caption uppercase tracking-wider">{label}</span>
        </div>
        <p className={`font-su-mono text-su-title-sm font-semibold [font-feature-settings:'tnum'] ${valueColor}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function Report({ report }: { report: TreasuryReconRes }) {
  const driftFlagged = report.attention.items.some((i) => /drift/i.test(i))
  const nombaUnavailable = report.nomba.error !== null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {report.status === "ok" ? (
            <span className="inline-flex items-center gap-1.5 rounded-su-pill bg-su-semantic-up/10 px-2.5 py-1 font-su-sans text-su-caption font-semibold text-su-semantic-up">
              <CheckCircle2 className="h-3.5 w-3.5" /> Balanced
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-su-pill bg-su-semantic-down/10 px-2.5 py-1 font-su-sans text-su-caption font-semibold text-su-semantic-down">
              <AlertTriangle className="h-3.5 w-3.5" /> Needs attention
            </span>
          )}
        </div>
        <span className="font-su-sans text-su-caption text-su-muted">
          Checked {new Date(report.checkedAt).toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Wallet}
          label="Nomba balance"
          value={nombaUnavailable ? "Unavailable" : naira(report.nomba.ledgerBalanceMinor)}
          tone={nombaUnavailable ? "bad" : "neutral"}
        />
        <Metric icon={Scale} label="Expected balance" value={naira(report.ledger.expectedBalanceMinor)} />
        <Metric
          icon={ArrowUpRight}
          label="Drift"
          value={naira(report.nomba.driftMinor)}
          tone={report.nomba.driftMinor === null ? "neutral" : driftFlagged ? "bad" : "good"}
        />
        <Metric
          icon={RefreshCcw}
          label="Outbound in flight"
          value={naira(report.ledger.outstandingOutboundMinor)}
        />
      </div>

      {nombaUnavailable && (
        <p className="font-su-sans text-su-caption text-su-muted">
          Live Nomba balance unavailable ({report.nomba.error}). Ledger figures below are still
          reconciled.
        </p>
      )}

      {/* Attention items */}
      <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
        <CardContent className="space-y-3 py-4">
          <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">Exceptions</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="font-su-mono text-su-title-sm font-semibold text-su-ink">
                {report.attention.stuckPayouts}
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">Stuck payouts</p>
            </div>
            <div>
              <p className="font-su-mono text-su-title-sm font-semibold text-su-ink">
                {report.attention.stuckWithdrawals}
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">Stuck withdrawals</p>
            </div>
            <div>
              <p className="font-su-mono text-su-title-sm font-semibold text-su-ink">
                {report.attention.unmatchedInbound}
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">Unmatched inbound</p>
            </div>
          </div>
          {report.attention.items.length > 0 ? (
            <ul className="list-inside list-disc space-y-1 border-t border-su-hairline-soft pt-3">
              {report.attention.items.map((item, i) => (
                <li key={i} className="font-su-sans text-su-caption text-su-semantic-down">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-su-hairline-soft pt-3 font-su-sans text-su-caption text-su-muted">
              No exceptions — Nomba matches the ledger and nothing is stuck.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * On-demand treasury reconciliation — compares Nomba's sub-account balance to
 * our ledger (Σ inbound − Σ settled payouts/withdrawals) and surfaces drift +
 * stuck/unmatched items. Runs via the web app's reconciliation endpoint; each
 * run is recorded in the admin audit log.
 */
export function TreasuryReconciliation() {
  const run = useRunReconciliation()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl font-su-sans text-su-body-sm text-su-muted">
          Compare Nomba&apos;s live sub-account balance against the ledger. Read-only — nothing moves;
          each run is recorded in the audit log.
        </p>
        <Button className="rounded-su-pill" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 h-4 w-4" />
          )}
          {run.data ? "Run again" : "Run reconciliation"}
        </Button>
      </div>

      {run.data ? (
        <Report report={run.data} />
      ) : run.isError ? (
        <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
          <CardContent className="flex items-center gap-3 py-8">
            <AlertTriangle className="h-5 w-5 text-su-semantic-down" />
            <p className="font-su-sans text-su-body-sm text-su-ink">
              {run.error instanceof Error ? run.error.message : "Reconciliation failed"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-su-xl border border-dashed border-su-hairline bg-su-surface-card">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Scale className="h-6 w-6 text-su-muted" />
            <p className="font-su-sans text-su-body-sm text-su-ink">No reconciliation run yet</p>
            <p className="max-w-sm font-su-sans text-su-caption text-su-muted">
              Run it to compare the treasury balance with the ledger and see any drift or stuck items.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

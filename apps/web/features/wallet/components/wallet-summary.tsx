"use client"

import { Wallet, Loader2 } from "lucide-react"
import { formatNaira } from "@/lib/money"
import type { WalletLedgerEntryDto } from "@/app/api/wallet/dto/wallet.dto"
import { useWallet } from "../queries"
import { TopUpDialog } from "./topup-dialog"
import { WithdrawDialog } from "./withdraw-dialog"

const SOURCE_LABEL: Record<string, string> = {
  TOPUP_BANK: "Bank top-up",
  TOPUP_CARD: "Card top-up",
  BUFFER_SWEEP: "Circle credit returned",
  REFUND_CREDIT: "Card verification credit",
  CIRCLE_DEBIT: "Circle contribution",
  WITHDRAWAL: "Withdrawal",
  REVERSAL: "Withdrawal reversed",
  ADJUSTMENT: "Adjustment",
}

function EntryRow({ entry }: { entry: WalletLedgerEntryDto }) {
  const isCredit = entry.direction === "CREDIT"
  return (
    <li className="flex items-center justify-between py-2">
      <div className="min-w-0">
        <p className="truncate font-su-sans text-su-body-sm text-su-ink">
          {SOURCE_LABEL[entry.source] ?? entry.source}
        </p>
        <p className="font-su-sans text-su-caption text-su-muted">
          {new Date(entry.createdAt).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
          })}
        </p>
      </div>
      <span
        className={`font-su-mono text-su-body-sm font-semibold [font-feature-settings:'tnum'] ${
          isCredit ? "text-su-semantic-up" : "text-su-ink"
        }`}
      >
        {isCredit ? "+" : "−"}
        {formatNaira(entry.amountMinor)}
      </span>
    </li>
  )
}

/** Homepage wallet panel — balance + top-up/withdraw actions + recent activity.
 * Replaces the old Settings wallet card as the primary wallet surface. */
export function WalletSummary() {
  const { data: wallet, isLoading } = useWallet()
  const balanceMinor = wallet?.balanceMinor ?? 0
  const entries = wallet?.entries.slice(0, 4) ?? []

  return (
    <div className="overflow-hidden rounded-su-xl border border-su-hairline bg-su-surface-card">
      <div className="flex flex-col gap-5 bg-gradient-to-br from-su-primary/10 to-transparent p-su-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-su-muted">
            <Wallet className="h-4 w-4 text-su-primary" />
            <span className="font-su-sans text-su-caption font-medium">Wallet balance</span>
          </div>
          {isLoading ? (
            <Loader2 className="mt-2 h-6 w-6 animate-spin text-su-muted" />
          ) : (
            <p className="font-su-mono text-su-display-sm font-bold text-su-ink [font-feature-settings:'tnum']">
              {formatNaira(balanceMinor)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TopUpDialog />
          {balanceMinor > 0 && <WithdrawDialog balanceMinor={balanceMinor} />}
        </div>
      </div>

      {entries.length > 0 && (
        <div className="border-t border-su-hairline px-su-lg py-4">
          <h3 className="mb-1 font-su-sans text-su-caption-sm font-semibold uppercase tracking-wider text-su-muted">
            Recent activity
          </h3>
          <ul className="divide-y divide-su-hairline-soft">
            {entries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

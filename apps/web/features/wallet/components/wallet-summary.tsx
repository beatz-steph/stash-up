"use client"

import { Wallet, Loader2 } from "lucide-react"
import { formatNaira } from "@/lib/money"
import { useWallet } from "../queries"
import { TopUpDialog } from "./topup-dialog"
import { WithdrawDialog } from "./withdraw-dialog"

/** Homepage wallet panel — balance + top-up/withdraw actions. Wallet movements
 * live in the unified Transactions feed (kind WALLET), not a separate list. */
export function WalletSummary() {
  const { data: wallet, isLoading } = useWallet()
  const balanceMinor = wallet?.balanceMinor ?? 0

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
    </div>
  )
}

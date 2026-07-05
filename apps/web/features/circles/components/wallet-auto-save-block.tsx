"use client"

import { Zap } from "lucide-react"
import { Switch } from "@workspace/ui/components/switch"
import { useToggleWalletAutoDebit } from "../mutations"

/**
 * Wallet auto-save for a single circle. Auto-collection draws ONLY from the
 * wallet balance — there are no saved cards to auto-debit (card payments are
 * one-time, member-initiated, via hosted checkout). When on, each cycle's
 * contribution is pulled from the wallet as soon as it's due.
 *
 * Flat block (no surface of its own) — the circle-detail "How you pay" panel
 * provides the border/padding, pairing this with the bank-transfer details.
 */
export function WalletAutoSaveBlock({
  circleId,
  autoDebitWallet,
}: {
  circleId: string
  autoDebitWallet: boolean
}) {
  const walletToggle = useToggleWalletAutoDebit(circleId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-su-primary" />
        <h3 className="font-su-sans text-su-body font-semibold text-su-ink">Auto-save</h3>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-su-lg bg-su-surface-muted px-3 py-2.5">
        <div>
          <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
            Pay from wallet automatically
          </p>
          <p className="font-su-sans text-su-caption text-su-muted">
            Each cycle&apos;s contribution is collected from your wallet balance as soon as it&apos;s
            due. Keep your wallet topped up and never miss a cycle.
          </p>
        </div>
        <Switch
          checked={autoDebitWallet}
          disabled={walletToggle.isPending}
          onCheckedChange={(v) => walletToggle.mutate(v)}
        />
      </div>
    </div>
  )
}

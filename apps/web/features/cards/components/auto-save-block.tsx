"use client"

import { useState } from "react"
import { CreditCard, Loader2, Plus, Zap } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { useCards } from "../queries"
import {
  useEnrollCard,
  useLinkAutoDebit,
  useUnlinkAutoDebit,
  useToggleWalletAutoDebit,
} from "../mutations"

function cardLabel(cardType: string | null, last4: string | null): string {
  const brand = cardType ? cardType.charAt(0).toUpperCase() + cardType.slice(1).toLowerCase() : "Card"
  return last4 ? `${brand} •••• ${last4}` : brand
}

/**
 * Auto-save controls for a single circle. A new circle never auto-debits an
 * existing card — the member explicitly links a saved card or adds a new one
 * (which binds to THIS circle only).
 */
export function AutoSaveBlock({
  circleId,
  autoDebitCardId,
  autoDebitWallet,
}: {
  circleId: string
  autoDebitCardId: string | null
  autoDebitWallet: boolean
}) {
  const { data: cards, isLoading } = useCards()
  const enroll = useEnrollCard()
  const link = useLinkAutoDebit(circleId)
  const unlink = useUnlinkAutoDebit(circleId)
  const walletToggle = useToggleWalletAutoDebit(circleId)
  const [selectedCardId, setSelectedCardId] = useState<string>("")

  const activeCards = (cards ?? []).filter((c) => c.status === "ACTIVE")
  const boundCard = activeCards.find((c) => c.id === autoDebitCardId)
  const busy = enroll.isPending || link.isPending || unlink.isPending

  return (
    <div className="space-y-4 rounded-su-xl border border-su-hairline bg-su-surface-card p-5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-su-primary" />
        <h3 className="font-su-sans text-su-body font-semibold text-su-ink">Auto-save</h3>
      </div>

      {/* Wallet auto-save toggle — pays from wallet balance first, before any card */}
      <div className="flex items-center justify-between gap-3 rounded-su-lg bg-su-surface-muted px-3 py-2.5">
        <div>
          <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
            Pay from wallet first
          </p>
          <p className="font-su-sans text-su-caption text-su-muted">
            Use your wallet balance for this circle before charging a card.
          </p>
        </div>
        <Switch
          checked={autoDebitWallet}
          disabled={walletToggle.isPending}
          onCheckedChange={(v) => walletToggle.mutate(v)}
        />
      </div>

      {autoDebitCardId && boundCard ? (
        <>
          <div className="flex items-center gap-3 rounded-su-lg bg-su-surface-muted px-3 py-2.5">
            <CreditCard className="h-5 w-5 text-su-primary" />
            <div className="flex-1">
              <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                {cardLabel(boundCard.cardType, boundCard.last4)}
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">
                We&apos;ll collect this circle&apos;s contribution automatically each cycle.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => unlink.mutate()}
          >
            {unlink.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Turn off auto-save
          </Button>
        </>
      ) : (
        <>
          <p className="font-su-sans text-su-caption text-su-muted">
            Link a card and we&apos;ll collect your contribution automatically. If you also
            transfer manually, any extra is saved as credit toward your next cycle.
          </p>

          {isLoading ? (
            <div className="flex items-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-su-muted" />
            </div>
          ) : activeCards.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={selectedCardId} onValueChange={setSelectedCardId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Choose a saved card" />
                </SelectTrigger>
                <SelectContent>
                  {activeCards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {cardLabel(c.cardType, c.last4)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={busy || !selectedCardId}
                onClick={() => link.mutate({ savedCardId: selectedCardId })}
              >
                {link.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Enable
              </Button>
            </div>
          ) : null}

          <Button
            variant={activeCards.length > 0 ? "ghost" : "default"}
            size="sm"
            disabled={busy}
            onClick={() => enroll.mutate({ circleId })}
          >
            {enroll.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add a new card
          </Button>
        </>
      )}
    </div>
  )
}

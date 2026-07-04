"use client"

import { useState } from "react"
import { Wallet, Loader2, Plus, Copy, Building2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { formatNaira } from "@/lib/money"
import { cardFeeOn } from "@/lib/fees"
import type { WalletLedgerEntryDto } from "@/app/api/wallet/dto/wallet.dto"
import { useWallet } from "../queries"
import { useProvisionWalletAccount, useTopupWalletByCard } from "../mutations"

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
    <li className="flex items-center justify-between py-2.5">
      <div>
        <p className="font-su-sans text-su-body-sm text-su-ink">
          {SOURCE_LABEL[entry.source] ?? entry.source}
        </p>
        <p className="font-su-sans text-su-caption text-su-muted">
          {new Date(entry.createdAt).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
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

export function WalletCard() {
  const { data: wallet, isLoading } = useWallet()
  const provision = useProvisionWalletAccount()
  const topupByCard = useTopupWalletByCard()
  const [showTopUp, setShowTopUp] = useState(false)
  const [cardAmount, setCardAmount] = useState("")

  const va = wallet?.virtualAccount ?? null
  const cardNaira = Number(cardAmount)
  const cardAmountMinor = Number.isFinite(cardNaira) ? Math.round(cardNaira * 100) : 0
  const cardValid = cardAmountMinor >= 10_000 // ₦100 minimum

  function handleShowTopUp() {
    setShowTopUp(true)
    if (!va) provision.mutate()
  }

  return (
    <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 font-su-sans text-su-title-sm font-semibold text-su-ink">
              <Wallet className="h-4 w-4 text-su-primary" />
              Wallet
            </CardTitle>
            <CardDescription className="font-su-sans text-su-caption text-su-muted">
              Spendable balance across your circles
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-su-muted" />
          </div>
        ) : (
          <>
            <div className="rounded-su-lg bg-su-surface-muted px-4 py-4">
              <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                Available balance
              </span>
              <p className="mt-1 font-su-mono text-su-title-lg font-bold text-su-ink [font-feature-settings:'tnum']">
                {formatNaira(wallet?.balanceMinor ?? 0)}
              </p>
            </div>

            {/* Card top-up — user pays amount + card fee, wallet gets the amount */}
            <div className="space-y-2 rounded-su-lg border border-su-hairline bg-su-surface p-4">
              <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                Top up with card
              </span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={100}
                  placeholder="Amount (₦)"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  disabled={!cardValid || topupByCard.isPending}
                  onClick={() => topupByCard.mutate({ amountMinor: cardAmountMinor })}
                >
                  {topupByCard.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Top up
                </Button>
              </div>
              {cardValid ? (
                <p className="font-su-sans text-su-caption text-su-muted">
                  You&apos;ll be charged {formatNaira(cardAmountMinor + cardFeeOn(cardAmountMinor))} (incl.{" "}
                  {formatNaira(cardFeeOn(cardAmountMinor))} card fee); {formatNaira(cardAmountMinor)} lands
                  in your wallet.
                </p>
              ) : (
                <p className="font-su-sans text-su-caption text-su-muted">
                  Minimum ₦100. A small card fee is added on top.
                </p>
              )}
            </div>

            {!showTopUp ? (
              <Button variant="outline" size="sm" onClick={handleShowTopUp}>
                <Plus className="mr-2 h-4 w-4" />
                Top up by bank transfer
              </Button>
            ) : provision.isPending ? (
              <div className="flex items-center gap-2 py-2 font-su-sans text-su-body-sm text-su-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Setting up your top-up account…
              </div>
            ) : va ? (
              <div className="space-y-3 rounded-su-lg border border-su-hairline bg-su-surface p-4">
                <p className="font-su-sans text-su-caption text-su-muted">
                  Transfer any amount to this account and it lands in your wallet.
                </p>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="font-su-sans text-su-caption-sm uppercase tracking-wider text-su-muted">
                      Account number
                    </span>
                    <p className="font-su-mono text-su-title-md font-semibold text-su-ink [font-feature-settings:'tnum']">
                      {va.bankAccountNumber}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-su-pill"
                    onClick={() => {
                      navigator.clipboard.writeText(va.bankAccountNumber)
                      toast.success("Account number copied")
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
                <div className="flex items-center gap-2 border-t border-su-hairline-soft pt-3 font-su-sans text-su-body-sm text-su-ink">
                  <Building2 className="h-4 w-4 text-su-muted" />
                  {va.bankName} · {va.bankAccountName}
                </div>
              </div>
            ) : (
              <p className="font-su-sans text-su-body-sm text-su-muted">
                Couldn&apos;t set up your top-up account. Please try again.
              </p>
            )}

            <div className="space-y-2">
              <h3 className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                Recent activity
              </h3>
              {wallet && wallet.entries.length > 0 ? (
                <ul className="divide-y divide-su-hairline-soft">
                  {wallet.entries.map((e) => (
                    <EntryRow key={e.id} entry={e} />
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-center font-su-sans text-su-caption text-su-muted">
                  No wallet activity yet.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

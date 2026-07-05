"use client"

import { useState } from "react"
import { Loader2, Plus, Copy, Building2, CreditCard } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { formatNaira } from "@/lib/money"
import { cardFeeOn } from "@/lib/fees"
import { useWallet } from "../queries"
import { useProvisionWalletAccount, useTopupWalletByCard } from "../mutations"

/** Top up the wallet — by card (one-time hosted checkout, never saved) or by
 * bank transfer to the user's dedicated virtual account. Lives behind a single
 * "Top up" action so the wallet surface stays clean. */
export function TopUpDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { data: wallet } = useWallet()
  const provision = useProvisionWalletAccount()
  const topupByCard = useTopupWalletByCard()
  const [cardAmount, setCardAmount] = useState("")

  const va = wallet?.virtualAccount ?? null
  const cardNaira = Number(cardAmount)
  const cardAmountMinor = Number.isFinite(cardNaira) ? Math.round(cardNaira * 100) : 0
  const cardValid = cardAmountMinor >= 10_000 // ₦100 minimum

  function onTabChange(value: string) {
    // Lazily provision the bank top-up account the first time it's viewed.
    if (value === "bank" && !va && !provision.isPending) provision.mutate()
  }

  function handleCardTopup() {
    // Redirects to Nomba's hosted checkout on success.
    topupByCard.mutate({ amountMinor: cardAmountMinor })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="rounded-su-pill">
            <Plus className="mr-2 h-4 w-4" />
            Top up
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Top up your wallet</DialogTitle>
          <DialogDescription>Add money by card or bank transfer.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="card" onValueChange={onTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="card">
              <CreditCard className="mr-2 h-4 w-4" />
              Card
            </TabsTrigger>
            <TabsTrigger value="bank">
              <Building2 className="mr-2 h-4 w-4" />
              Bank transfer
            </TabsTrigger>
          </TabsList>

          {/* Card top-up — user pays amount + card fee, wallet gets the amount */}
          <TabsContent value="card" className="space-y-3 pt-2">
            <Input
              type="number"
              inputMode="numeric"
              min={100}
              placeholder="Amount (₦)"
              value={cardAmount}
              onChange={(e) => setCardAmount(e.target.value)}
            />

            <p className="font-su-sans text-su-caption text-su-muted">
              You&apos;ll enter your card on Nomba&apos;s secure checkout. Your card details
              are never stored.
            </p>

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
            <Button
              className="w-full rounded-su-pill"
              disabled={!cardValid || topupByCard.isPending}
              onClick={handleCardTopup}
            >
              {topupByCard.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue to payment
            </Button>
          </TabsContent>

          {/* Bank transfer — dedicated virtual account */}
          <TabsContent value="bank" className="space-y-3 pt-2">
            {provision.isPending ? (
              <div className="flex items-center gap-2 py-4 font-su-sans text-su-body-sm text-su-muted">
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
              <div className="space-y-3 py-2">
                <p className="font-su-sans text-su-body-sm text-su-muted">
                  Couldn&apos;t set up your top-up account.
                </p>
                <Button
                  variant="outline"
                  className="rounded-su-pill"
                  onClick={() => provision.mutate()}
                >
                  Try again
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

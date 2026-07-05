"use client"

import { useState } from "react"
import { Loader2, Wallet, CreditCard, Plus } from "lucide-react"
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
import { formatNaira } from "@/lib/money"
import { cardFeeOn } from "@/lib/fees"
import { useWallet } from "@/features/wallet/queries"
import { useCards } from "@/features/cards/queries"
import { useEnrollCard } from "@/features/cards/mutations"
import { usePayCircleNow } from "../mutations"

function cardLabel(cardType: string | null, last4: string | null): string {
  const brand = cardType ? cardType.charAt(0).toUpperCase() + cardType.slice(1).toLowerCase() : "Card"
  return last4 ? `${brand} ···· ${last4}` : brand
}

/** Pay the current cycle's amount due on demand — wallet (instant) or a saved
 * card (settles via webhook). Fixed amount = what's still owed this cycle. */
export function PayNowDialog({
  circleId,
  amountDueMinor,
}: {
  circleId: string
  amountDueMinor: number
}) {
  const [open, setOpen] = useState(false)
  const { data: wallet } = useWallet()
  const { data: cards } = useCards()
  const enroll = useEnrollCard()
  const payNow = usePayCircleNow(circleId)
  const [selectedCardId, setSelectedCardId] = useState("")

  const balanceMinor = wallet?.balanceMinor ?? 0
  const walletCovers = Math.min(balanceMinor, amountDueMinor)
  const walletPartial = balanceMinor > 0 && balanceMinor < amountDueMinor

  const activeCards = cards?.filter((c) => c.status === "ACTIVE") ?? []
  const effectiveCardId = selectedCardId || activeCards[0]?.id || ""

  function payWallet() {
    payNow.mutate(
      { method: "WALLET" },
      { onSuccess: () => setOpen(false) }
    )
  }

  function payCard() {
    if (!effectiveCardId) return
    payNow.mutate(
      { method: "CARD", savedCardId: effectiveCardId },
      { onSuccess: () => setOpen(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-su-pill">Pay now</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay this cycle</DialogTitle>
          <DialogDescription>
            {formatNaira(amountDueMinor)} due — pay now from your wallet or a card.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="wallet" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wallet">
              <Wallet className="mr-2 h-4 w-4" />
              Wallet
            </TabsTrigger>
            <TabsTrigger value="card">
              <CreditCard className="mr-2 h-4 w-4" />
              Card
            </TabsTrigger>
          </TabsList>

          {/* Wallet — instant internal debit */}
          <TabsContent value="wallet" className="space-y-3 pt-2">
            <div className="flex items-center justify-between rounded-su-lg bg-su-surface-muted px-4 py-3">
              <span className="font-su-sans text-su-caption text-su-muted">Wallet balance</span>
              <span className="font-su-mono text-su-body-sm font-semibold text-su-ink [font-feature-settings:'tnum']">
                {formatNaira(balanceMinor)}
              </span>
            </div>
            {walletPartial && (
              <p className="font-su-sans text-su-caption text-su-muted">
                This covers {formatNaira(walletCovers)} of your {formatNaira(amountDueMinor)} due —
                pay the rest by card or bank transfer.
              </p>
            )}
            <Button
              className="w-full rounded-su-pill"
              disabled={balanceMinor <= 0 || payNow.isPending}
              onClick={payWallet}
            >
              {payNow.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {balanceMinor > 0 ? `Pay ${formatNaira(walletCovers)} from wallet` : "Wallet is empty"}
            </Button>
          </TabsContent>

          {/* Card — charge a saved card, settles via webhook */}
          <TabsContent value="card" className="space-y-3 pt-2">
            {activeCards.length > 0 ? (
              <>
                <div className="space-y-1.5">
                  {activeCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedCardId(card.id)}
                      className={`flex w-full items-center gap-3 rounded-su-lg border p-3 text-left transition-colors ${
                        effectiveCardId === card.id
                          ? "border-su-primary bg-su-primary/5"
                          : "border-su-hairline hover:bg-su-surface"
                      }`}
                    >
                      <CreditCard className="h-4 w-4 shrink-0 text-su-muted" />
                      <span className="font-su-sans text-su-body-sm text-su-ink">
                        {cardLabel(card.cardType, card.last4)}
                      </span>
                      {effectiveCardId === card.id && (
                        <span className="ml-auto font-su-sans text-su-caption font-semibold text-su-primary">
                          Selected
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <p className="font-su-sans text-su-caption text-su-muted">
                  You&apos;ll be charged {formatNaira(amountDueMinor + cardFeeOn(amountDueMinor))}{" "}
                  (incl. {formatNaira(cardFeeOn(amountDueMinor))} card fee); {formatNaira(amountDueMinor)}{" "}
                  goes to your contribution.
                </p>
                <Button
                  className="w-full rounded-su-pill"
                  disabled={!effectiveCardId || payNow.isPending}
                  onClick={payCard}
                >
                  {payNow.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Pay {formatNaira(amountDueMinor)} with card
                </Button>
              </>
            ) : (
              <div className="space-y-3 py-2">
                <p className="font-su-sans text-su-body-sm text-su-muted">
                  You don&apos;t have a saved card yet. Add one to pay by card.
                </p>
                <Button
                  variant="outline"
                  className="w-full rounded-su-pill"
                  disabled={enroll.isPending}
                  onClick={() => enroll.mutate({ circleId })}
                >
                  {enroll.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add a card
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState } from "react"
import { Loader2, Wallet, CreditCard } from "lucide-react"
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
import { usePayCircleNow } from "../mutations"

/** Pay the current cycle's amount due on demand — from the wallet (instant) or
 * by card via a one-time hosted checkout (cards are never saved). Fixed amount
 * = what's still owed this cycle. */
export function PayNowDialog({
  circleId,
  amountDueMinor,
}: {
  circleId: string
  amountDueMinor: number
}) {
  const [open, setOpen] = useState(false)
  const { data: wallet } = useWallet()
  const payNow = usePayCircleNow(circleId)

  const balanceMinor = wallet?.balanceMinor ?? 0
  const walletCovers = Math.min(balanceMinor, amountDueMinor)
  const walletPartial = balanceMinor > 0 && balanceMinor < amountDueMinor

  function payWallet() {
    payNow.mutate({ method: "WALLET" }, { onSuccess: () => setOpen(false) })
  }

  function payCard() {
    // Redirects to Nomba's hosted checkout on success.
    payNow.mutate({ method: "CARD" })
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

          {/* Card — one-time hosted checkout, settles via webhook */}
          <TabsContent value="card" className="space-y-3 pt-2">
            <p className="font-su-sans text-su-caption text-su-muted">
              You&apos;ll enter your card on Nomba&apos;s secure checkout. Your card details are
              never stored.
            </p>
            <p className="font-su-sans text-su-caption text-su-muted">
              You&apos;ll be charged {formatNaira(amountDueMinor + cardFeeOn(amountDueMinor))}{" "}
              (incl. {formatNaira(cardFeeOn(amountDueMinor))} card fee); {formatNaira(amountDueMinor)}{" "}
              goes to your contribution.
            </p>
            <Button
              className="w-full rounded-su-pill"
              disabled={payNow.isPending}
              onClick={payCard}
            >
              {payNow.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Pay {formatNaira(amountDueMinor)} with card
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

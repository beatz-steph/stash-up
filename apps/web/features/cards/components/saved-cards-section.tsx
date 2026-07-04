"use client"

import { CreditCard, Loader2, Plus, Trash2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { useCards } from "../queries"
import { useEnrollCard, useRevokeCard } from "../mutations"

function cardLabel(cardType: string | null, last4: string | null): string {
  const brand = cardType ? cardType.charAt(0).toUpperCase() + cardType.slice(1).toLowerCase() : "Card"
  return last4 ? `${brand} •••• ${last4}` : brand
}

export function SavedCardsSection() {
  const { data: cards, isLoading } = useCards()
  const enroll = useEnrollCard()
  const revoke = useRevokeCard()

  return (
    <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="font-su-sans text-su-title-sm font-semibold text-su-ink">
              Saved cards
            </CardTitle>
            <CardDescription className="font-su-sans text-su-caption text-su-muted">
              Cards you can use to auto-save into your circles
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={enroll.isPending}
            onClick={() => enroll.mutate({})}
          >
            {enroll.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add card
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-su-muted" />
          </div>
        ) : !cards || cards.length === 0 ? (
          <div className="space-y-3 py-4">
            <p className="text-center font-su-sans text-su-body-sm text-su-muted">
              No saved cards yet.
            </p>
            <p className="text-center font-su-sans text-su-caption text-su-muted">
              We&apos;ll charge ₦50 to verify your card and refund it right after. Processing
              fees may be deducted from the refund.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-su-hairline-soft">
            {cards.map((card) => (
              <li key={card.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-su-muted" />
                  <div>
                    <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                      {cardLabel(card.cardType, card.last4)}
                    </p>
                    <p className="font-su-sans text-su-caption text-su-muted">
                      {card.boundCircles.length === 0
                        ? "Not linked to any circle"
                        : `Auto-saving: ${card.boundCircles.map((c) => c.circleName).join(", ")}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {card.status === "EXPIRED" && (
                    <Badge variant="outline" className="border-su-semantic-down/30 text-su-semantic-down">
                      Expired
                    </Badge>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Remove card">
                        <Trash2 className="h-4 w-4 text-su-semantic-down" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this card?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {card.boundCircles.length > 0
                            ? `Auto-save will be turned off for ${card.boundCircles.length} circle(s). You can add the card again later.`
                            : "You can add the card again later."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => revoke.mutate(card.id)}
                          disabled={revoke.isPending}
                        >
                          Remove card
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

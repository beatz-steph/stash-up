"use client"

import Link from "next/link"
import { ArrowDownLeft, ArrowUpRight } from "lucide-react"

import { formatNaira } from "@/lib/money"
import type { TransactionItem } from "@/app/api/transactions/dto/transaction.dto"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function TransactionsList({ items }: { items: TransactionItem[] }) {
  return (
    <ul className="divide-y divide-su-hairline-soft">
      {items.map((t) => {
        const isWallet = t.kind === "WALLET"
        const isPayout = t.kind === "PAYOUT"
        // Inflow: payouts, and wallet credits. Outflow: contributions + debits.
        const isCredit = isPayout || (isWallet && t.direction === "CREDIT")

        const title = isWallet
          ? (t.label ?? "Wallet")
          : `${isPayout ? "Payout received" : "Contribution"} · ${t.circleName}`
        const subtitle = isWallet
          ? formatDate(t.createdAt)
          : `${t.cycleSequence ? `Cycle ${t.cycleSequence} · ` : ""}${formatDate(t.createdAt)}`

        const inner = (
          <div className="flex items-center gap-3 px-su-lg py-4 transition-colors hover:bg-su-surface-soft">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-su-full ${
                isCredit
                  ? "bg-su-semantic-up/10 text-su-semantic-up"
                  : "bg-su-surface-strong text-su-muted"
              }`}
            >
              {isCredit ? (
                <ArrowDownLeft className="h-4 w-4" />
              ) : (
                <ArrowUpRight className="h-4 w-4" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-su-sans text-su-body-sm font-semibold text-su-ink">
                {title}
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">{subtitle}</p>
            </div>

            <div className="text-right">
              <p
                className={`font-su-mono text-su-body-sm font-semibold [font-feature-settings:'tnum'] ${
                  isCredit ? "text-su-semantic-up" : "text-su-ink"
                }`}
              >
                {isCredit ? "+" : isWallet ? "−" : ""}
                {formatNaira(t.amountMinor)}
              </p>
              {t.status ? (
                <p className="font-su-sans text-su-caption-sm text-su-muted">{t.status}</p>
              ) : null}
            </div>
          </div>
        )

        // Circle-scoped rows link to the circle; wallet rows are not linkable.
        return (
          <li key={t.id}>
            {t.circleId ? (
              <Link href={`/circles/${t.circleId}`}>{inner}</Link>
            ) : (
              inner
            )}
          </li>
        )
      })}
    </ul>
  )
}

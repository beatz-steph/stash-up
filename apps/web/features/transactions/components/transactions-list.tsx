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
        const isPayout = t.kind === "PAYOUT"
        return (
          <li key={t.id}>
            <Link
              href={`/circles/${t.circleId}`}
              className="flex items-center gap-3 px-su-lg py-4 transition-colors hover:bg-su-surface-soft"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-su-full ${
                  isPayout
                    ? "bg-su-semantic-up/10 text-su-semantic-up"
                    : "bg-su-surface-strong text-su-muted"
                }`}
              >
                {isPayout ? (
                  <ArrowDownLeft className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-su-sans text-su-body-sm font-semibold text-su-ink">
                  {isPayout ? "Payout received" : "Contribution"} · {t.circleName}
                </p>
                <p className="font-su-sans text-su-caption text-su-muted">
                  {t.cycleSequence ? `Cycle ${t.cycleSequence} · ` : ""}
                  {formatDate(t.createdAt)}
                </p>
              </div>

              <div className="text-right">
                <p
                  className={`font-su-mono text-su-body-sm font-semibold [font-feature-settings:'tnum'] ${
                    isPayout ? "text-su-semantic-up" : "text-su-ink"
                  }`}
                >
                  {isPayout ? "+" : ""}
                  {formatNaira(t.amountMinor)}
                </p>
                <p className="font-su-sans text-su-caption-sm text-su-muted">{t.status}</p>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

"use client"

import Link from "next/link"
import { ArrowRight, Receipt } from "lucide-react"

import { Skeleton } from "@workspace/ui/components/skeleton"
import { useTransactions } from "../queries/use-transactions"
import { useIsOnboarded } from "@/features/onboarding/components/onboarding-provider"
import { TransactionsList } from "./transactions-list"

const HOME_LIMIT = 6

export function RecentTransactions() {
  const isOnboarded = useIsOnboarded()
  const { data, isLoading } = useTransactions(HOME_LIMIT)

  if (!isOnboarded) return null

  const items = data?.items ?? []

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-su-sans text-su-title-sm font-semibold text-su-ink">
          Recent transactions
        </h2>
        {items.length > 0 && (
          <Link
            href="/transactions"
            className="flex items-center gap-1 font-su-sans text-su-caption font-semibold text-su-muted hover:text-su-ink"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card">
        {isLoading ? (
          <div className="space-y-3 p-su-lg">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-su-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-su-full bg-su-surface-strong text-su-muted">
              <Receipt className="h-5 w-5" />
            </span>
            <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
              No transactions yet
            </p>
            <p className="font-su-sans text-su-caption text-su-muted">
              Contributions, payouts and wallet activity will show up here.
            </p>
          </div>
        ) : (
          <TransactionsList items={items} />
        )}
      </div>
    </section>
  )
}

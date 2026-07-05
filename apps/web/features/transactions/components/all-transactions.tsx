"use client"

import { Loader2, Receipt } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useInfiniteTransactions } from "../queries/use-transactions"
import { TransactionsList } from "./transactions-list"

export function AllTransactions() {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteTransactions()
  const items = data?.pages.flatMap((page) => page.items) ?? []

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-su-xl border border-su-hairline bg-su-surface-card p-su-lg">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-su-lg" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card p-8 text-center font-su-sans text-su-body-sm text-su-semantic-down">
        Failed to load transactions.
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-su-xl border border-dashed border-su-hairline bg-su-surface-soft px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-su-full bg-su-surface-strong text-su-muted">
          <Receipt className="h-6 w-6" />
        </span>
        <div className="space-y-1">
          <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
            No transactions yet
          </p>
          <p className="font-su-sans text-su-caption text-su-muted">
            Your contributions, payouts and wallet activity will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-su-xl border border-su-hairline bg-su-surface-card">
      <TransactionsList items={items} />
      {hasNextPage && (
        <div className="flex justify-center border-t border-su-hairline-soft p-su-lg">
          <Button
            variant="outline"
            className="rounded-su-pill"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

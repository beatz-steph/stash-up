"use client"

import { useState } from "react"
import { usePayouts } from "../queries/payouts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

export function PayoutsTable() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  
  const { data, isLoading, isError } = usePayouts({ page, limit: 50, status: status || undefined })

  if (isError) return <div className="text-su-semantic-down">Failed to load payouts</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select
          className="border border-su-hairline rounded-su-md px-3 py-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All Statuses</option>
          <option value="INITIATED">Initiated</option>
          <option value="PENDING_BILLING">Pending Billing</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </div>

      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created At</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Bank</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Failure Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-su-muted">Loading...</TableCell>
              </TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-su-muted">No payouts found.</TableCell>
              </TableRow>
            ) : (
              data?.items.map((payout) => {
                const isFailed = payout.status === "FAILED"
                return (
                  <TableRow key={payout.id} className={cn(isFailed && "bg-su-semantic-down/5 hover:bg-su-semantic-down/10")}>
                    <TableCell className="text-su-muted">{new Date(payout.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-su-ink font-medium">₦{(payout.amountMinor / 100).toLocaleString("en-NG")}</TableCell>
                    <TableCell className="font-medium text-su-ink">{payout.recipientAccountName}</TableCell>
                    <TableCell className="text-su-muted">{payout.recipientBankName}</TableCell>
                    <TableCell>
                      <Badge variant={isFailed ? "destructive" : payout.status === "SUCCESS" ? "default" : "secondary"}>
                        {payout.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-su-muted">{payout.failureReason || "—"}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.total > data.limit && (
        <div className="flex items-center justify-between">
          <span className="text-su-body-sm text-su-muted">
            Showing {data.items.length} of {data.total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border rounded-su-md disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * data.limit >= data.total}
              className="px-3 py-1 border rounded-su-md disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import { useWebhooks } from "../queries/webhooks"
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

export function WebhooksTable() {
  const [page, setPage] = useState(1)
  
  const { data, isLoading, isError } = useWebhooks({ page, limit: 50 })

  if (isError) return <div className="text-su-semantic-down">Failed to load webhooks</div>

  return (
    <div className="space-y-4">
      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Received At</TableHead>
              <TableHead>Event ID</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Signature Valid</TableHead>
              <TableHead>Processed</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-su-muted">Loading...</TableCell>
              </TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-su-muted">No webhooks found.</TableCell>
              </TableRow>
            ) : (
              data?.items.map((webhook) => {
                const hasError = !!webhook.processingError
                return (
                  <TableRow key={webhook.id} className={cn(hasError && "bg-su-semantic-down/5 hover:bg-su-semantic-down/10")}>
                    <TableCell className="text-su-muted">{new Date(webhook.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs text-su-muted">{webhook.providerEventId}</TableCell>
                    <TableCell className="font-medium text-su-ink">{webhook.eventType}</TableCell>
                    <TableCell>
                      {webhook.signatureValid ? (
                        <Badge variant="outline">Valid</Badge>
                      ) : (
                        <Badge variant="destructive">Invalid</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {webhook.processed ? (
                        <Badge variant="default">Processed</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-su-muted">{webhook.processingError || "—"}</TableCell>
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

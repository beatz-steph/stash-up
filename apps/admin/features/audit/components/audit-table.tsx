"use client"

import { useState } from "react"
import { useAuditLogs } from "../queries/audit"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export function AuditTable() {
  const [page, setPage] = useState(1)
  
  const { data, isLoading, isError } = useAuditLogs({ page, limit: 50 })

  if (isError) return <div className="text-su-semantic-down">Failed to load audit logs</div>

  return (
    <div className="space-y-4">
      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Entity ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-su-muted">Loading...</TableCell>
              </TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-su-muted">No audit logs found.</TableCell>
              </TableRow>
            ) : (
              data?.items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-su-muted">{new Date(log.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="font-medium text-su-ink">{log.adminName}</TableCell>
                  <TableCell className="font-medium text-su-ink">{log.action}</TableCell>
                  <TableCell className="text-su-muted">{log.entityType || "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-su-muted">{log.entityId || "—"}</TableCell>
                </TableRow>
              ))
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

"use client"

import { useState } from "react"
import { useCircles } from "../queries/circles"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import Link from "next/link"

export function CirclesTable() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  
  const { data, isLoading, isError } = useCircles({ page, limit: 50, status: status || undefined })

  if (isError) return <div className="text-su-semantic-down">Failed to load circles</div>

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
          <option value="FORMING">Forming</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Contribution</TableHead>
              <TableHead>Slots</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-su-muted">Loading...</TableCell>
              </TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-su-muted">No circles found.</TableCell>
              </TableRow>
            ) : (
              data?.items.map((circle) => (
                <TableRow key={circle.id}>
                  <TableCell className="font-medium text-su-ink">{circle.name}</TableCell>
                  <TableCell>
                    <Badge variant={circle.status === "ACTIVE" ? "default" : "secondary"}>
                      {circle.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-su-muted">{circle.frequency}</TableCell>
                  <TableCell className="text-su-muted font-medium">₦{(circle.contributionMinor / 100).toLocaleString("en-NG")}</TableCell>
                  <TableCell className="text-su-muted">{circle.totalSlots}</TableCell>
                  <TableCell className="text-su-muted">{new Date(circle.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/circles/${circle.id}`} className="text-su-primary hover:underline font-medium text-sm">
                      View
                    </Link>
                  </TableCell>
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

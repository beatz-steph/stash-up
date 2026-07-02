"use client"

import { useState } from "react"
import { useReconciliationQueue } from "../queries/reconciliation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { authClient } from "@/lib/auth-client"
import { MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Button } from "@workspace/ui/components/button"
import { ResolveTransferDialog } from "./resolve-transfer-dialog"

export function ReconciliationTable() {
  const [page, setPage] = useState(1)
  
  const { data: sessionData } = authClient.useSession()
  const isSuperAdmin = sessionData?.user?.role === "SUPER_ADMIN"

  const { data, isLoading, isError } = useReconciliationQueue({ page, limit: 50 })

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<{ id: string, amountMinor: number } | null>(null)

  if (isError) return <div className="text-su-semantic-down">Failed to load reconciliation queue</div>

  return (
    <div className="space-y-4">
      {selectedTransfer && (
        <ResolveTransferDialog
          open={resolveDialogOpen}
          onOpenChange={setResolveDialogOpen}
          transferId={selectedTransfer.id}
          amountMinor={selectedTransfer.amountMinor}
        />
      )}

      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Received At</TableHead>
              <TableHead>Provider Event ID</TableHead>
              <TableHead>Sender Name</TableHead>
              <TableHead>Account Number</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
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
                <TableCell colSpan={7} className="text-center py-8 text-su-muted">Queue is empty.</TableCell>
              </TableRow>
            ) : (
              data?.items.map((transfer) => (
                <TableRow key={transfer.id} className="bg-su-accent-yellow/5 hover:bg-su-accent-yellow/10">
                  <TableCell className="text-su-muted">{new Date(transfer.receivedAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs text-su-muted">{transfer.nombaTransactionId}</TableCell>
                  <TableCell className="font-medium text-su-ink">{transfer.senderName || "Unknown"}</TableCell>
                  <TableCell className="text-su-muted">{transfer.senderAccountNumber || "N/A"}</TableCell>
                  <TableCell className="text-su-ink font-medium">₦{(transfer.amountMinor / 100).toLocaleString("en-NG")}</TableCell>
                  <TableCell>
                    <Badge variant="destructive">{transfer.matchStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {isSuperAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4 text-su-muted" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedTransfer({ id: transfer.id, amountMinor: transfer.amountMinor })
                              setResolveDialogOpen(true)
                            }}
                          >
                            Resolve Manually
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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

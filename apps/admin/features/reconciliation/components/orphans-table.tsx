"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { authClient } from "@/lib/auth-client"
import { useOrphanQueue } from "../queries/reconciliation"
import { useResolveOrphan, useIgnoreOrphan } from "../mutations/use-orphan-actions"

type OrphanItem = NonNullable<ReturnType<typeof useOrphanQueue>["data"]>["items"][number]

function naira(amountMinor: number) {
  return `₦${(amountMinor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
}

function OrphanActionDialog({
  orphan,
  action,
  onClose,
}: {
  orphan: OrphanItem
  action: "replay" | "ignore"
  onClose: () => void
}) {
  const [note, setNote] = useState("")
  const resolve = useResolveOrphan(orphan.id)
  const ignore = useIgnoreOrphan(orphan.id)
  const isReplay = action === "replay"
  const isPending = resolve.isPending || ignore.isPending

  const submit = () => {
    if (isReplay) {
      resolve.mutate({ note: note || undefined }, { onSuccess: onClose })
    } else {
      if (!note.trim()) return
      ignore.mutate({ note }, { onSuccess: onClose })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReplay ? "Replay orphan credit" : "Ignore orphan"}</DialogTitle>
          <DialogDescription>
            {isReplay ? (
              <>
                Apply {naira(orphan.amountMinor)} to{" "}
                <span className="font-semibold text-su-ink">
                  {orphan.member.name ?? "member"}
                </span>{" "}
                in {orphan.member.circleName}. It goes to their current contribution (overflow to
                credit), or entirely to credit if they&apos;re paid up or have no open cycle.
              </>
            ) : (
              <>Mark this {naira(orphan.amountMinor)} credit as needing no action. A note is required.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          placeholder={isReplay ? "Optional note" : "Why is this being ignored? (required)"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={isPending || (!isReplay && !note.trim())}
            variant={isReplay ? "default" : "destructive"}
          >
            {isReplay ? "Replay credit" : "Ignore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OrphansTable() {
  const { data: sessionData } = authClient.useSession()
  const isSuperAdmin = sessionData?.user?.role === "SUPER_ADMIN"

  const { data, isLoading, isError } = useOrphanQueue({ page: 1, limit: 50 })
  const [active, setActive] = useState<{ orphan: OrphanItem; action: "replay" | "ignore" } | null>(
    null
  )

  if (isError) return <div className="text-su-semantic-down">Failed to load orphans</div>

  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      {active && (
        <OrphanActionDialog
          orphan={active.orphan}
          action={active.action}
          onClose={() => setActive(null)}
        />
      )}

      <div className="overflow-hidden rounded-su-xl border border-su-hairline bg-su-surface-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction time</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Circle</TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>Amount</TableHead>
              {isSuperAdmin && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-su-muted">
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-su-muted">
                  No pending orphans. Spooled credits that never produced a webhook appear here.
                </TableCell>
              </TableRow>
            ) : (
              items.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-su-muted">
                    {new Date(o.transactionAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium text-su-ink">
                    {o.member.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-su-muted">{o.member.circleName}</TableCell>
                  <TableCell className="text-su-muted">{o.senderName ?? "—"}</TableCell>
                  <TableCell className="font-medium text-su-ink">{naira(o.amountMinor)}</TableCell>
                  {isSuperAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => setActive({ orphan: o, action: "replay" })}
                        >
                          Replay
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActive({ orphan: o, action: "ignore" })}
                        >
                          Ignore
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

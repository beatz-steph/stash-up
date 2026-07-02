"use client"

import { useCircle } from "../queries/circles"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export function CircleDetail({ id }: { id: string }) {
  const { data: circle, isLoading, isError } = useCircle(id)

  if (isLoading) return <div className="text-su-muted">Loading circle...</div>
  if (isError || !circle) return <div className="text-su-semantic-down">Failed to load circle</div>

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-su-sans text-su-title-lg font-semibold text-su-ink">
                Details
              </CardTitle>
              <Badge variant={circle.status === "ACTIVE" ? "default" : "secondary"}>
                {circle.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
              <span className="text-su-muted font-medium text-sm">Name</span>
              <span className="col-span-2 text-su-ink font-medium">{circle.name}</span>
            </div>
            <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
              <span className="text-su-muted font-medium text-sm">Frequency</span>
              <span className="col-span-2 text-su-ink">{circle.frequency}</span>
            </div>
            <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
              <span className="text-su-muted font-medium text-sm">Contribution</span>
              <span className="col-span-2 text-su-ink font-medium">₦{(circle.contributionMinor / 100).toLocaleString("en-NG")}</span>
            </div>
            <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
              <span className="text-su-muted font-medium text-sm">Created</span>
              <span className="col-span-2 text-su-ink">{new Date(circle.createdAt).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-3 py-2">
              <span className="text-su-muted font-medium text-sm">Slots</span>
              <span className="col-span-2 text-su-ink">{circle.members.length} / {circle.totalSlots}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="font-su-sans text-su-title-lg font-semibold text-su-ink">
            Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border border-su-hairline rounded-su-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payout Position</TableHead>
                  <TableHead>Virtual Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {circle.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium text-su-ink">{member.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{member.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.status === "ACTIVE" ? "default" : "secondary"}>
                        {member.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-su-muted">{member.payoutPosition}</TableCell>
                    <TableCell>
                      {member.virtualAccount ? (
                        <div className="text-sm">
                          <div>{member.virtualAccount.bankName}</div>
                          <div className="font-mono text-su-muted">{member.virtualAccount.accountNumber}</div>
                        </div>
                      ) : (
                        <span className="text-su-muted italic">None</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

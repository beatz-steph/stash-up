"use client"

import { useUser } from "../queries/users"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"

export function UserDetail({ id }: { id: string }) {
  const { data: user, isLoading, isError } = useUser(id)

  if (isLoading) return <div className="text-su-muted">Loading user...</div>
  if (isError || !user) return <div className="text-su-semantic-down">Failed to load user</div>

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-su-sans text-su-title-lg font-semibold text-su-ink">
              Profile
            </CardTitle>
            {user.blockedFromCircles ? (
              <Badge variant="destructive">Blocked</Badge>
            ) : (
              <Badge variant="outline">Active</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
            <span className="text-su-muted font-medium text-sm">Name</span>
            <span className="col-span-2 text-su-ink font-medium">{user.name}</span>
          </div>
          <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
            <span className="text-su-muted font-medium text-sm">Email</span>
            <span className="col-span-2 text-su-ink">{user.email}</span>
          </div>
          <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
            <span className="text-su-muted font-medium text-sm">Username</span>
            <span className="col-span-2 text-su-ink">@{user.username}</span>
          </div>
          <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
            <span className="text-su-muted font-medium text-sm">Joined</span>
            <span className="col-span-2 text-su-ink">{new Date(user.createdAt).toLocaleString()}</span>
          </div>
          <div className="grid grid-cols-3 py-2">
            <span className="text-su-muted font-medium text-sm">Defaults</span>
            <span className="col-span-2 text-su-ink">{user.lifetimeDefaultCount}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="font-su-sans text-su-title-lg font-semibold text-su-ink">
            Withdrawal Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user.withdrawalAccount ? (
            <>
              <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
                <span className="text-su-muted font-medium text-sm">Bank Name</span>
                <span className="col-span-2 text-su-ink font-medium">{user.withdrawalAccount.bankName}</span>
              </div>
              <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
                <span className="text-su-muted font-medium text-sm">Account Name</span>
                <span className="col-span-2 text-su-ink">{user.withdrawalAccount.accountName}</span>
              </div>
              <div className="grid grid-cols-3 py-2">
                <span className="text-su-muted font-medium text-sm">Account Number</span>
                <span className="col-span-2 text-su-ink font-mono">{user.withdrawalAccount.accountNumber}</span>
              </div>
            </>
          ) : (
            <div className="text-su-muted italic py-4">No withdrawal account linked.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

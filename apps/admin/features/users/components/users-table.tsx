"use client"

import { useState } from "react"
import { useUsers } from "../queries/users"
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

export function UsersTable() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  
  const { data, isLoading, isError } = useUsers({ page, limit: 50, search: search || undefined })

  if (isError) return <div className="text-su-semantic-down">Failed to load users</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Search users..."
          className="border border-su-hairline rounded-su-md px-3 py-2 text-sm"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
      </div>

      <div className="rounded-su-xl border border-su-hairline bg-su-surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-su-muted">Loading...</TableCell>
              </TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-su-muted">No users found.</TableCell>
              </TableRow>
            ) : (
              data?.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium text-su-ink">{user.name}</TableCell>
                  <TableCell className="text-su-muted">{user.email}</TableCell>
                  <TableCell className="text-su-muted">@{user.username}</TableCell>
                  <TableCell className="text-su-muted">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {user.blockedFromCircles ? (
                      <Badge variant="destructive">Blocked</Badge>
                    ) : user.lifetimeDefaultCount > 0 ? (
                      <Badge variant="secondary">Defaults: {user.lifetimeDefaultCount}</Badge>
                    ) : (
                      <Badge variant="outline">Good Standing</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/users/${user.id}`} className="text-su-primary hover:underline font-medium text-sm">
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

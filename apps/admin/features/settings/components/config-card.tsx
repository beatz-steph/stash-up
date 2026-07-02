"use client"

import { useConfig } from "../queries/config"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"

export function ConfigCard() {
  const { data, isLoading, isError } = useConfig()

  if (isLoading) return <div className="text-su-muted">Loading configuration...</div>
  if (isError) return <div className="text-su-semantic-down">Failed to load configuration</div>
  if (!data) return null

  return (
    <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card shadow-[0_4px_12px_rgba(0,0,0,0.04)] max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-su-sans text-su-title-lg font-semibold text-su-ink">
            Nomba Integration
          </CardTitle>
          <Badge variant={data.status === "ACTIVE" ? "default" : "destructive"}>
            {data.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
          <span className="text-su-muted font-medium text-sm">Provider</span>
          <span className="col-span-2 text-su-ink font-medium">{data.provider}</span>
        </div>
        <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
          <span className="text-su-muted font-medium text-sm">Base URL</span>
          <span className="col-span-2 text-su-ink font-mono text-sm">{data.baseUrl}</span>
        </div>
        <div className="grid grid-cols-3 py-2 border-b border-su-hairline">
          <span className="text-su-muted font-medium text-sm">Client ID</span>
          <span className="col-span-2 text-su-ink font-mono text-sm">{data.clientId}</span>
        </div>
        <div className="grid grid-cols-3 py-2">
          <span className="text-su-muted font-medium text-sm">Last Updated</span>
          <span className="col-span-2 text-su-ink text-sm">{new Date(data.updatedAt).toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  )
}

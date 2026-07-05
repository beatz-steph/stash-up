import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { getMetrics } from "@/lib/api/data/metrics"
import { serverApiOptions } from "@/lib/api/server"
import { getAdminSession } from "@/lib/session"
import {
  AlertTriangle,
  Clock,
  Users,
  CircleDot,
  RefreshCcw,
  Inbox,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  Wallet,
} from "lucide-react"

function naira(minor: number): string {
  return `₦${(minor / 100).toLocaleString("en-NG")}`
}

export default async function DashboardPage() {
  const session = await getAdminSession()
  if (!session) {
    redirect("/login")
  }

  let metrics: Awaited<ReturnType<typeof getMetrics>> | null = null
  try {
    metrics = await getMetrics(await serverApiOptions())
  } catch {
    metrics = null
  }

  if (!metrics) {
    return (
      <div className="space-y-8">
        <div className="space-y-1">
          <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Platform overview</h1>
          <p className="font-su-sans text-su-body-sm text-su-muted">
            Welcome back, {session.user.name}.
          </p>
        </div>
        <Card className="rounded-su-xl border border-su-hairline bg-su-surface-card shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          <CardContent className="flex items-center gap-3 py-8">
            <AlertTriangle className="h-5 w-5 text-su-semantic-down" />
            <div>
              <p className="font-su-sans text-su-body-sm font-semibold text-su-ink">
                Couldn&apos;t load metrics
              </p>
              <p className="font-su-sans text-su-caption text-su-muted">
                The metrics service is unreachable. Refresh to try again.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const attention = [
    {
      label: "Reconciliation backlog",
      value: metrics.needsAttention.reconciliationBacklog,
      hint: "Unmatched transfers",
      tone: "down" as const,
      icon: AlertTriangle,
    },
    {
      label: "Pending orphans",
      value: metrics.needsAttention.pendingOrphans,
      hint: "Spooled, awaiting replay",
      tone: "warn" as const,
      icon: Inbox,
    },
    {
      label: "Failed payouts",
      value: metrics.needsAttention.failedPayouts,
      hint: "Need investigation",
      tone: "down" as const,
      icon: AlertTriangle,
    },
    {
      label: "Cycles awaiting resolution",
      value: metrics.needsAttention.awaitingResolutionCycles,
      hint: "Stalled cycles",
      tone: "warn" as const,
      icon: Clock,
    },
  ]

  const stats = [
    {
      label: "Total users",
      value: metrics.users.total.toLocaleString(),
      hint: `${metrics.users.blocked} blocked`,
      icon: Users,
    },
    {
      label: "Active circles",
      value: metrics.circles.active.toLocaleString(),
      hint: `${metrics.circles.forming} forming · ${metrics.circles.completed} completed`,
      icon: CircleDot,
    },
    {
      label: "Active cycles",
      value: (metrics.cycles.open + metrics.cycles.collecting).toLocaleString(),
      hint: `${metrics.cycles.readyToPayout} ready for payout`,
      icon: RefreshCcw,
    },
  ]

  const { inbound, outbound } = metrics.transactions
  const netMinor = inbound.valueMinor - outbound.valueMinor
  const flow = [
    {
      label: "Money in",
      value: naira(inbound.valueMinor),
      hint: `${inbound.count.toLocaleString()} transfers in`,
      icon: ArrowDownLeft,
      color: "text-su-semantic-up",
    },
    {
      label: "Money out",
      value: naira(outbound.valueMinor),
      hint: `${outbound.count.toLocaleString()} payouts sent`,
      icon: ArrowUpRight,
      color: "text-su-primary",
    },
    {
      label: "Net in accounts",
      value: naira(netMinor),
      hint: "Money in minus money out",
      icon: Scale,
      color: "text-su-ink",
    },
    {
      label: "Wallet liabilities",
      value: naira(metrics.wallet.liabilitiesMinor),
      hint: `Held across ${metrics.wallet.accounts.toLocaleString()} wallets`,
      icon: Wallet,
      color: "text-su-primary",
    },
  ]

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Platform overview</h1>
        <p className="font-su-sans text-su-body-sm text-su-muted">
          Welcome back, {session.user.name}. Here&apos;s what needs your attention.
        </p>
      </div>

      {/* Needs attention */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {attention.map((item) => {
          const Icon = item.icon
          const isDown = item.tone === "down"
          return (
            <Card
              key={item.label}
              className={`rounded-su-xl border shadow-[0_4px_12px_rgba(0,0,0,0.04)] ${
                isDown
                  ? "border-su-semantic-down/20 bg-su-semantic-down/[0.04]"
                  : "border-su-accent-yellow/30 bg-su-accent-yellow/[0.06]"
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-su-sans text-su-body-sm font-medium text-su-body">
                  {item.label}
                </CardTitle>
                <Icon className={`h-4 w-4 ${isDown ? "text-su-semantic-down" : "text-su-accent-yellow"}`} />
              </CardHeader>
              <CardContent>
                <div className="font-su-sans text-su-title-lg font-bold text-su-ink">{item.value}</div>
                <p className="mt-1 font-su-sans text-su-caption text-su-muted">{item.hint}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Overview stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((item) => {
          const Icon = item.icon
          return (
            <Card
              key={item.label}
              className="rounded-su-xl border border-su-hairline bg-su-surface-card shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-su-sans text-su-body-sm font-medium text-su-muted">
                  {item.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-su-primary" />
              </CardHeader>
              <CardContent>
                <div className="font-su-sans text-su-title-lg font-bold text-su-ink">{item.value}</div>
                <p className="mt-1 font-su-sans text-su-caption text-su-muted">{item.hint}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Transaction flow */}
      <div className="space-y-3">
        <h2 className="font-su-sans text-su-body font-semibold text-su-ink">Transaction flow</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flow.map((item) => {
            const Icon = item.icon
            return (
              <Card
                key={item.label}
                className="rounded-su-xl border border-su-hairline bg-su-surface-card shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-su-sans text-su-body-sm font-medium text-su-muted">
                    {item.label}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${item.color}`} />
                </CardHeader>
                <CardContent>
                  <div className={`font-su-sans text-su-title-lg font-bold ${item.color}`}>
                    {item.value}
                  </div>
                  <p className="mt-1 font-su-sans text-su-caption text-su-muted">{item.hint}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

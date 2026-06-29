"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  CircleDot,
  RefreshCcw,
  Banknote,
  Webhook,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react"

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  superAdminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Users", href: "/users", icon: Users },
  { name: "Circles", href: "/circles", icon: CircleDot },
  { name: "Reconciliation", href: "/reconciliation", icon: RefreshCcw },
  { name: "Payouts", href: "/payouts", icon: Banknote },
  { name: "Webhooks", href: "/webhooks", icon: Webhook },
  { name: "Audit", href: "/audit", icon: ScrollText },
  { name: "Settings", href: "/settings", icon: Settings, superAdminOnly: true },
]

export function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((i) => !i.superAdminOnly || role === "SUPER_ADMIN")

  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-su-md px-3 py-2.5 font-su-sans text-su-body-sm font-medium transition-colors ${
              active
                ? "bg-su-surface-strong text-su-ink"
                : "text-su-body hover:bg-su-surface-soft hover:text-su-ink"
            }`}
          >
            <Icon className={`h-[18px] w-[18px] ${active ? "text-su-primary" : "text-su-muted"}`} />
            <span>{item.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}

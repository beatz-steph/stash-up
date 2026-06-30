import { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AppSidebar } from "./components/app-sidebar"
import {
  SidebarProvider,
  SidebarInset,
} from "@workspace/ui/components/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/sign-in")
  }

  const { user } = session

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset className="bg-su-canvas min-h-screen">
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

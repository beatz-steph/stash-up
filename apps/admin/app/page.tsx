import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { SignOutButton } from "@/components/sign-out-button"

export default async function Page() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/login")
  }

  const { user } = session

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-slate-950 p-6 text-slate-100">
      {/* Background Neon Glows */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-20%] left-[-20%] h-[600px] w-[600px] rounded-full bg-purple-500/10 blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-20%] h-[600px] w-[600px] rounded-full bg-indigo-500/10 blur-[150px]" />
      </div>

      <div className="w-full max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 font-bold text-white shadow-md shadow-purple-500/20">
              SU
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wider uppercase bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                StashUp Admin
              </h1>
              <p className="text-xs text-muted-foreground">Platform Administration Portal</p>
            </div>
          </div>
          <SignOutButton />
        </div>

        <Card className="border-border/40 bg-card/60 shadow-2xl backdrop-blur-md">
          <CardHeader className="border-b border-border/40 pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-semibold">Admin Panel</CardTitle>
                <CardDescription className="text-muted-foreground/80">
                  Secure administration interface.
                </CardDescription>
              </div>
              <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-400 ring-1 ring-purple-500/20 ring-inset">
                Admin Session Active
              </span>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border/40 pt-6">
            <div className="grid grid-cols-3 py-4 first:pt-0">
              <span className="text-sm font-medium text-muted-foreground">Full Name</span>
              <span className="col-span-2 text-sm font-semibold text-slate-200">{user.name}</span>
            </div>
            <div className="grid grid-cols-3 py-4">
              <span className="text-sm font-medium text-muted-foreground">Email Address</span>
              <span className="col-span-2 text-sm font-semibold text-slate-200">{user.email}</span>
            </div>
            <div className="grid grid-cols-3 py-4">
              <span className="text-sm font-medium text-muted-foreground">System Role</span>
              <span className="col-span-2 text-sm font-mono font-semibold text-purple-400">{user.role}</span>
            </div>
            <div className="grid grid-cols-3 py-4 last:pb-0">
              <span className="text-sm font-medium text-muted-foreground">User ID</span>
              <span className="col-span-2 text-sm font-mono text-xs text-muted-foreground">{user.id}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

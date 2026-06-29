"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Form } from "@workspace/ui/components/form"
import { FormInput } from "@workspace/ui/form/input"
import { toast } from "@workspace/ui/components/sonner"
import { FormPasswordInput } from "@workspace/ui/form/password-input"

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function AdminLoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = React.useState(false)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(true)
    try {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      })
      if (error) {
        toast.error(error.message || "Invalid credentials")
        return
      }
      toast.success("Signed in")
      router.push("/")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  })

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-su-surface-soft px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-2.5 text-center">
          <div className="flex items-center gap-2.5">
            <span className="font-su-display text-su-title-lg font-bold tracking-tight text-su-ink">
              StashUp
            </span>
            <span className="rounded-su-pill bg-su-primary/10 px-2.5 py-0.5 font-su-sans text-su-caption-sm font-semibold text-su-primary">
              Admin
            </span>
          </div>
          <p className="font-su-sans text-su-body-sm text-su-muted">
            Platform administration · authorized personnel only
          </p>
        </div>

        <div className="rounded-su-xl border border-su-hairline bg-su-surface-card p-su-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
          <div className="mb-6 space-y-1 text-center">
            <h1 className="font-su-sans text-su-title-md font-semibold text-su-ink">Sign in</h1>
            <p className="font-su-sans text-su-body-sm text-su-muted">
              Enter your admin credentials to continue
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-5">
              <FormInput
                control={form.control}
                name="email"
                label="Email"
                type="email"
                placeholder="admin@stashup.xyz"
                disabled={isLoading}
              />
              <FormPasswordInput
                control={form.control}
                name="password"
                label="Password"
                type="password"
                placeholder="••••••••"
                disabled={isLoading}
              />
              <Button size="lg" type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  )
}

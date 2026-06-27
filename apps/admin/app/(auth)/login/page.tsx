"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Form } from "@workspace/ui/components/form"
import { FormInput } from "@workspace/ui/form/input"
import { toast } from "@workspace/ui/components/sonner"

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function AdminLoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(true)
    setError(null)
    try {
      const { error: authError } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      })
      if (authError) {
        setError(authError.message || "Invalid credentials")
      } else {
        toast.success("Successfully logged in as Admin!")
        router.push("/")
        router.refresh()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  })

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 text-slate-100">
      {/* Background neon glows */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-indigo-500/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 font-bold text-white shadow-lg shadow-purple-500/20">
            SU
          </div>
          <span className="text-xl font-bold tracking-wider uppercase bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Stashup Portal
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Platform Administration
          </span>
        </div>

        <Card className="border-border/40 bg-card/60 shadow-2xl backdrop-blur-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-2xl font-bold text-transparent">
              Admin Login
            </CardTitle>
            <CardDescription className="text-muted-foreground/80">
              Authorized personnel only. Multi-factor authentication required.
            </CardDescription>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={onSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
                    {error}
                  </div>
                )}
                <FormInput
                  control={form.control}
                  name="email"
                  label="Admin Email"
                  type="email"
                  placeholder="admin@stashup.com"
                  disabled={isLoading}
                  className="transition-all duration-200 focus:border-purple-500 focus:ring-purple-500/20"
                />
                <FormInput
                  control={form.control}
                  name="password"
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  disabled={isLoading}
                  className="transition-all duration-200 focus:border-purple-500 focus:ring-purple-500/20"
                />
              </CardContent>
              <CardFooter className="flex flex-col space-y-4">
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold transition-all duration-300 hover:from-purple-600 hover:to-indigo-600 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100 cursor-pointer"
                  disabled={isLoading}
                >
                  {isLoading ? "Authenticating..." : "Login"}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </div>
  )
}

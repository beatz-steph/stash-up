"use client"

import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Form } from "@workspace/ui/components/form"
import { FormInput } from "@workspace/ui/form/input"
import { AuthShell } from "@/features/auth/components/auth-shell"
import { useSignInForm } from "./model"

export function SignInForm() {
  const { form, onSubmit, isLoading } = useSignInForm()

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Stashup account"
      footer={
        <>
          New to Stashup?{" "}
          <Link
            href="/sign-up"
            className="font-semibold text-su-primary hover:text-su-primary-active transition-colors"
          >
            Create an account
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-5">
            <FormInput
              control={form.control}
              name="email"
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              disabled={isLoading}
            />

            <div className="relative">
              <FormInput
                control={form.control}
                name="password"
                label="Password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isLoading}
              />
              <div className="absolute right-0 top-0 flex h-5 items-center justify-end">
                <Link
                  href="/forgot-password"
                  className="font-su-sans text-su-caption font-semibold text-su-primary hover:text-su-primary-active transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Form>
    </AuthShell>
  )
}

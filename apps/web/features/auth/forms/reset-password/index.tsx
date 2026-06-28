"use client"

import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Form } from "@workspace/ui/components/form"
import { FormInput } from "@workspace/ui/form/input"
import { AuthShell } from "@/features/auth/components/auth-shell"
import { useResetPasswordForm } from "./model"

export function ResetPasswordForm({ token }: { token?: string }) {
  const { form, onSubmit, isLoading } = useResetPasswordForm(token)

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password to secure your account"
      footer={
        <>
          Remembered it?{" "}
          <Link
            href="/sign-in"
            className="font-semibold text-su-primary hover:text-su-primary-active transition-colors"
          >
            Sign in
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-5">
            <FormInput
              control={form.control}
              name="password"
              label="New password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={isLoading}
              description="At least 8 characters"
            />

            <FormInput
              control={form.control}
              name="confirmPassword"
              label="Confirm new password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={isLoading}
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? "Updating..." : "Update password"}
          </Button>
        </form>
      </Form>
    </AuthShell>
  )
}

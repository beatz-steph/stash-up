"use client"

import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Form } from "@workspace/ui/components/form"
import { FormInput } from "@workspace/ui/form/input"
import { AuthShell } from "@/features/auth/components/auth-shell"
import { useForgotPasswordForm } from "./model"

export function ForgotPasswordForm() {
  const { form, onSubmit, isLoading, isSuccess } = useForgotPasswordForm()

  if (isSuccess) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={
          <>
            We&apos;ve sent a password reset link to{" "}
            <span className="font-semibold text-su-ink">
              {form.getValues("email")}
            </span>
            .
          </>
        }
      >
        <Link
          href="/sign-in"
          className="inline-flex w-full items-center justify-center bg-su-surface-strong text-su-ink font-su-sans text-su-button font-semibold leading-[1.15] rounded-su-pill px-5 py-3 h-12 transition-colors hover:bg-su-hairline"
        >
          Back to sign in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link"
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
          <FormInput
            control={form.control}
            name="email"
            label="Email Address"
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            disabled={isLoading}
          />

          <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? "Sending link..." : "Send reset link"}
          </Button>
        </form>
      </Form>
    </AuthShell>
  )
}

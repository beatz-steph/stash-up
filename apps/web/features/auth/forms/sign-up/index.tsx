"use client"

import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Form } from "@workspace/ui/components/form"
import { FormInput } from "@workspace/ui/form/input"
import { FormPasswordInput } from "@workspace/ui/form/password-input"
import { AuthShell } from "@/features/auth/components/auth-shell"
import { useSignUpForm } from "./model"
import type { UsernameStatus } from "../../queries/use-username-availability"

function StepProgress({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-6 flex items-center gap-2" aria-hidden>
      {[1, 2].map((n) => (
        <span
          key={n}
          className={`h-1.5 flex-1 rounded-su-pill transition-colors ${
            n <= step ? "bg-su-primary" : "bg-su-surface-strong"
          }`}
        />
      ))}
    </div>
  )
}

function UsernameHint({ status }: { status: UsernameStatus }) {
  if (status === "checking") {
    return (
      <p className="mt-1.5 font-su-sans text-su-caption text-su-muted">
        Checking availability…
      </p>
    )
  }
  if (status === "available") {
    return (
      <p className="mt-1.5 font-su-sans text-su-caption font-medium text-su-semantic-up">
        Username is available
      </p>
    )
  }
  if (status === "taken") {
    return (
      <p className="mt-1.5 font-su-sans text-su-caption font-medium text-su-semantic-down">
        That username is already taken
      </p>
    )
  }
  if (status === "error") {
    return (
      <p className="mt-1.5 font-su-sans text-su-caption text-su-muted">
        Couldn&apos;t check availability right now
      </p>
    )
  }
  return null
}

export function SignUpForm() {
  const { form, onSubmit, isLoading, step, backToStep1, usernameStatus } =
    useSignUpForm()

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        step === 1
          ? "Tell us a bit about you"
          : "Now secure your account with a password"
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-semibold text-su-primary hover:text-su-primary-active transition-colors"
          >
            Sign in
          </Link>
        </>
      }
    >
      <StepProgress step={step} />

      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-6">
          {step === 1 ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  control={form.control}
                  name="firstName"
                  label="First name"
                  type="text"
                  placeholder="Ada"
                  autoComplete="given-name"
                />
                <FormInput
                  control={form.control}
                  name="lastName"
                  label="Last name"
                  type="text"
                  placeholder="Lovelace"
                  autoComplete="family-name"
                />
              </div>

              <div>
                <FormInput
                  control={form.control}
                  name="username"
                  label="Username"
                  type="text"
                  placeholder="adalovelace"
                  autoComplete="username"
                />
                <UsernameHint status={usernameStatus} />
              </div>

              <FormInput
                control={form.control}
                name="email"
                label="Email Address"
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
              />

              <Button type="submit" className="w-full" size="lg">
                Continue
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <FormPasswordInput
                control={form.control}
                name="password"
                label="Password"
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={isLoading}
                description="At least 8 characters"
              />

              <FormPasswordInput
                control={form.control}
                name="confirmPassword"
                label="Confirm password"
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={isLoading}
              />

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  size="lg"
                  onClick={backToStep1}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? "Creating..." : "Create account"}
                </Button>
              </div>
            </div>
          )}
        </form>
      </Form>
    </AuthShell>
  )
}

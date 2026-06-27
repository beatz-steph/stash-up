"use client"

import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Form } from "@workspace/ui/components/form"
import { FormInput } from "@workspace/ui/form/input"
import { useSignInForm } from "./model"

export function SignInForm() {
  const { form, onSubmit, isLoading, error } = useSignInForm()

  return (
    <Card className="w-full max-w-md border-border/40 bg-card/60 shadow-2xl backdrop-blur-md transition-all duration-300 hover:border-border/80">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          Welcome back
        </CardTitle>
        <CardDescription className="text-muted-foreground/80">
          Enter your email and password to access your StashUp dashboard
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive animate-in fade-in zoom-in duration-200">
                {error}
              </div>
            )}
            <FormInput
              control={form.control}
              name="email"
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              disabled={isLoading}
              className="transition-all duration-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
            <FormInput
              control={form.control}
              name="password"
              label="Password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isLoading}
              className="transition-all duration-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold transition-all duration-300 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100 cursor-pointer"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
            <div className="text-center text-sm text-muted-foreground/80">
              Don&apos;t have an account?{" "}
              <Link
                href="/sign-up"
                className="font-medium text-indigo-400 underline-offset-4 hover:text-indigo-300 hover:underline transition-colors"
              >
                Sign up
              </Link>
            </div>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}

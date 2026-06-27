"use client"

import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useSignUpForm } from "./model"

export function SignUpForm() {
  const { form, onSubmit, isLoading, error } = useSignUpForm()

  return (
    <Card className="w-full max-w-md border-border/40 bg-card/60 shadow-2xl backdrop-blur-md transition-all duration-300 hover:border-border/80">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          Create an account
        </CardTitle>
        <CardDescription className="text-muted-foreground/80">
          Enter your details below to create your thrift account and join circles
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive animate-in fade-in zoom-in duration-200">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                autoComplete="name"
                disabled={isLoading}
                required
                {...form.register("name")}
                className="transition-all duration-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username (@tag)</Label>
              <Input
                id="username"
                type="text"
                placeholder="johndoe"
                autoComplete="username"
                disabled={isLoading}
                required
                {...form.register("username")}
                className="transition-all duration-200 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
              {form.formState.errors.username && (
                <p className="text-xs text-destructive">{form.formState.errors.username.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              disabled={isLoading}
              required
              {...form.register("email")}
              className="transition-all duration-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={isLoading}
              required
              {...form.register("password")}
              className="transition-all duration-200 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 pt-4">
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold transition-all duration-300 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100 cursor-pointer"
            disabled={isLoading}
          >
            {isLoading ? "Creating account..." : "Sign Up"}
          </Button>
          <div className="text-center text-sm text-muted-foreground/80">
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="font-medium text-indigo-400 underline-offset-4 hover:text-indigo-300 hover:underline transition-colors"
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}

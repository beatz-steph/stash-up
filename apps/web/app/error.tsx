"use client"

import { useEffect } from "react"
import { Button } from "@workspace/ui/components/button"

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-su-canvas p-6 text-center space-y-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-su-full bg-su-semantic-down/10">
        <svg className="h-8 w-8 text-su-semantic-down" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div className="space-y-2 max-w-md">
        <h1 className="font-su-display text-su-title-lg font-bold text-su-ink">Something went wrong</h1>
        <p className="font-su-sans text-su-body-md text-su-muted">
          We encountered an unexpected error. Please try again or contact support if the issue persists.
        </p>
      </div>
      <Button onClick={() => reset()} size="lg" variant="outline">
        Try again
      </Button>
    </div>
  )
}

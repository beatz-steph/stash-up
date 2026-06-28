import * as React from "react"

interface AuthShellProps {
  /** Page heading, e.g. "Welcome back". */
  title: string
  /** Optional one-line supporting copy under the heading. */
  subtitle?: React.ReactNode
  /** The form (or other) content. */
  children: React.ReactNode
  /** Optional centered footer row, e.g. the "Already have an account?" link. */
  footer?: React.ReactNode
}

/**
 * Shared template for every auth screen (sign-in, sign-up, forgot/reset
 * password): brand wordmark, heading, sub-heading, content, and an optional
 * footer. Lives inside the (auth) two-column layout.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="w-full">
      <div className="font-su-display text-su-title-md font-bold text-su-ink mb-10">
        Stashup
      </div>

      <div className="space-y-2 mb-8">
        <h1 className="font-su-display text-su-display-sm font-bold text-su-ink leading-[1.1]">
          {title}
        </h1>
        {subtitle && (
          <p className="font-su-sans text-su-body-md text-su-muted">{subtitle}</p>
        )}
      </div>

      {children}

      {footer && (
        <div className="text-center font-su-sans text-su-body-sm text-su-muted mt-8">
          {footer}
        </div>
      )}
    </div>
  )
}

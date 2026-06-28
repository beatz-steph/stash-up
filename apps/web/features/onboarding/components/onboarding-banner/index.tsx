"use client"

import Link from "next/link"
import { Progress } from "@workspace/ui/components/progress"
import { OnboardingStatus } from "../../queries"
import { CheckIcon } from "lucide-react"
import { buttonVariants } from "@workspace/ui/components/button"

interface OnboardingBannerProps {
  status: OnboardingStatus
}

export function OnboardingBanner({ status }: OnboardingBannerProps) {
  const { account, withdrawal, circle } = status

  // If all completed, show success state briefly then hide (or return null)
  const allComplete = account && withdrawal && circle
  if (allComplete) {
    return (
      <div className="bg-su-surface-card border border-su-hairline rounded-su-xl p-su-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] space-y-2 animate-out fade-out duration-300">
        <h3 className="font-su-sans text-su-title-md font-semibold text-su-ink flex items-center gap-2">
          <span>You&apos;re all set 🎉</span>
        </h3>
        <p className="font-su-sans text-su-body-sm text-su-body">
          Your Stashup account is fully verified and your first savings circle is ready.
        </p>
      </div>
    )
  }

  // Calculate progress
  const stages = [
    { key: "account", label: "Create account", desc: "Start saving in minutes", complete: account },
    { key: "withdrawal", label: "Withdrawal account", desc: "Where we send payouts", complete: withdrawal },
    { key: "circle", label: "First savings circle", desc: "Save together, win together", complete: circle },
  ]

  const completedCount = stages.filter((s) => s.complete).length
  const progressPercent = (completedCount / 3) * 100

  // Determine current active step (first incomplete step)
  let activeIndex = stages.findIndex((s) => !s.complete)
  if (activeIndex === -1) activeIndex = 3

  return (
    <div className="bg-su-surface-card border border-su-hairline rounded-su-xl p-su-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-su-sans text-su-title-md font-semibold text-su-ink">
            Complete your onboarding
          </h2>
          <p className="font-su-sans text-su-body-sm text-su-muted">
            You are {completedCount} of 3 steps done. Get full access to savings circles.
          </p>
        </div>
        <div className="w-full sm:w-48 space-y-1.5">
          <div className="flex justify-between font-su-sans text-su-caption-sm text-su-muted">
            <span>Setup progress</span>
            <span className="font-semibold text-su-ink">{completedCount}/3</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 border-t border-su-hairline-soft">
        {stages.map((stage, idx) => {
          const isFinished = stage.complete
          const isActive = idx === activeIndex

          return (
            <div
              key={stage.key}
              className={`flex flex-col justify-between p-4 rounded-su-lg border transition-colors ${
                isActive
                  ? "bg-su-surface-soft/50 border-su-hairline"
                  : "border-transparent"
              }`}
            >
              <div className="flex gap-3">
                {/* Step circle indicator */}
                <div className="shrink-0">
                  {isFinished ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-su-full bg-su-primary text-su-on-primary">
                      <CheckIcon className="h-4 w-4" strokeWidth={3} />
                    </div>
                  ) : isActive ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-su-full border-2 border-su-ink bg-su-canvas text-su-ink font-su-sans text-su-caption font-semibold">
                      {idx + 1}
                    </div>
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-su-full border border-su-hairline bg-su-canvas text-su-muted font-su-sans text-su-caption">
                      {idx + 1}
                    </div>
                  )}
                </div>

                {/* Step labels */}
                <div className="space-y-0.5">
                  <h3
                    className={`font-su-sans text-su-title-sm ${
                      isActive ? "font-semibold text-su-ink" : isFinished ? "text-su-ink" : "text-su-muted"
                    }`}
                  >
                    {stage.label}
                  </h3>
                  <p className="font-su-sans text-su-caption text-su-muted leading-tight">
                    {stage.desc}
                  </p>
                </div>
              </div>

              {/* Step Action CTA */}
              {isActive && (
                <div className="mt-4 pt-1">
                  {stage.key === "withdrawal" && (
                    <Link
                      href="/onboarding/withdrawal-account"
                      className={buttonVariants({ size: "sm", className: "w-fit text-su-on-primary" })}
                    >
                      Set up withdrawal account
                    </Link>
                  )}
                  {stage.key === "circle" && (
                    <Link
                      href="/circles/new"
                      className={buttonVariants({ size: "sm", className: "w-fit text-su-on-primary" })}
                    >
                      Create first circle
                    </Link>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

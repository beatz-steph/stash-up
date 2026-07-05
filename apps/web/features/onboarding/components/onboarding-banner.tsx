"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Progress } from "@workspace/ui/components/progress"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { CheckIcon, LockIcon, Loader2, X } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { authClient } from "@/lib/auth-client"
import { isOnboardingComplete } from "../functions"
import type { OnboardingStatus } from "@/app/api/onboarding/dto/status.dto"
import { WithdrawalAccountModal } from "./withdrawal-account-modal"

interface OnboardingBannerProps {
  status: OnboardingStatus
  /** Used to resend the verification email. */
  userEmail: string
  /** When the user already belongs to a circle, the "all set" nudge is redundant. */
  hasCircles?: boolean
}

export function OnboardingBanner({ status, userEmail, hasCircles = false }: OnboardingBannerProps) {
  const router = useRouter()
  const [resending, setResending] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem("onboarding-banner-dismissed") === "true") {
      setDismissed(true)
    }
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem("onboarding-banner-dismissed", "true")
  }

  const { account, verified, withdrawal } = status

  // ── Setup complete → unlock circles ────────────────────────────────────────
  if (isOnboardingComplete(status)) {
    // Once they're in a circle, the celebration/CTA has served its purpose.
    if (hasCircles || dismissed) return null

    return (
      <div className="relative bg-su-surface-card border border-su-hairline rounded-su-xl p-su-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <button 
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-su-muted hover:text-su-ink transition-colors p-1"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="space-y-1">
          <h3 className="font-su-sans text-su-title-md font-semibold text-su-ink flex items-center gap-2">
            <span>You&apos;re all set 🎉</span>
          </h3>
          <p className="font-su-sans text-su-body-sm text-su-body">
            Your account is verified and your payout destination is linked. Start a savings circle or join one.
          </p>
        </div>
        <Link
          href="/circles/new"
          className={buttonVariants({ className: "w-fit text-su-on-primary" })}
        >
          Create your first circle
        </Link>
      </div>
    )
  }

  // ── Setup in progress ───────────────────────────────────────────────────────
  const handleResendVerification = async () => {
    setResending(true)
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: userEmail,
        callbackURL: "/dashboard",
      })
      if (error) {
        toast.error(error.message || "Couldn't send the verification email. Try again.")
        return
      }
      toast.success("Verification email sent — check your inbox.")
    } catch {
      toast.error("Couldn't send the verification email. Try again.")
    } finally {
      setResending(false)
    }
  }

  const stages = [
    { key: "account", label: "Create account", desc: "You're in — welcome to StashUp", complete: account },
    { key: "verify", label: "Verify your email", desc: "Confirm it's really you", complete: verified },
    { key: "withdrawal", label: "Add withdrawal account", desc: "Where we send your payouts", complete: withdrawal },
  ] as const

  const completedCount = stages.filter((s) => s.complete).length
  const progressPercent = (completedCount / stages.length) * 100

  // The active step is the first incomplete one; steps after it are locked.
  let activeIndex = stages.findIndex((s) => !s.complete)
  if (activeIndex === -1) activeIndex = stages.length

  return (
    <div className="bg-su-surface-card border border-su-hairline rounded-su-xl p-su-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-su-sans text-su-title-md font-semibold text-su-ink">
            Finish setting up your account
          </h2>
          <p className="font-su-sans text-su-body-sm text-su-muted">
            {completedCount} of {stages.length} steps done. Complete these to create or join a savings circle.
          </p>
        </div>
        <div className="w-full sm:w-48 space-y-1.5">
          <div className="flex justify-between font-su-sans text-su-caption-sm text-su-muted">
            <span>Setup progress</span>
            <span className="font-semibold text-su-ink">{completedCount}/{stages.length}</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 border-t border-su-hairline-soft">
        {stages.map((stage, idx) => {
          const isFinished = stage.complete
          const isActive = idx === activeIndex
          const isLocked = !isFinished && !isActive

          return (
            <div
              key={stage.key}
              className={`flex flex-col justify-between p-4 rounded-su-lg border transition-colors ${
                isActive ? "bg-su-surface-soft/50 border-su-hairline" : "border-transparent"
              }`}
            >
              <div className="flex gap-3">
                {/* Step indicator */}
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
                    <div className="flex h-7 w-7 items-center justify-center rounded-su-full border border-su-hairline bg-su-canvas text-su-muted-soft">
                      <LockIcon className="h-3.5 w-3.5" />
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
                    {isLocked ? "Complete the previous step first" : stage.desc}
                  </p>
                </div>
              </div>

              {/* Active-step action */}
              {isActive && (
                <div className="mt-4 pt-1 flex flex-col gap-2">
                  {stage.key === "verify" && (
                    <>
                      <Button
                        size="sm"
                        className="w-fit text-su-on-primary"
                        onClick={handleResendVerification}
                        disabled={resending}
                      >
                        {resending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          "Resend verification email"
                        )}
                      </Button>
                      <button
                        type="button"
                        onClick={() => router.refresh()}
                        className="w-fit font-su-sans text-su-caption font-semibold text-su-primary hover:text-su-primary-active transition-colors"
                      >
                        I&apos;ve verified — refresh
                      </button>
                    </>
                  )}
                  {stage.key === "withdrawal" && (
                    <WithdrawalAccountModal open={modalOpen} onOpenChange={setModalOpen}>
                      <Button size="sm" className="w-fit text-su-on-primary">
                        Set up withdrawal account
                      </Button>
                    </WithdrawalAccountModal>
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

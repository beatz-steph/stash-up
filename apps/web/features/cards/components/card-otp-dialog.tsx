"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { useSubmitCardOtp, useCancelCardOtp } from "../mutations"

/** Identifiers returned by a 3DS-gated card charge, needed to submit the OTP. */
export interface CardOtpHandle {
  orderReference: string
  transactionId: string
}

/**
 * OTP step for a 3DS-gated tokenized card charge. Some Nomba accounts route
 * saved-card charges through an OTP: the charge endpoint returns "OTP sent" and
 * the customer enters that code here to complete the debit. Open it by passing a
 * non-null `handle` (from the pay-now / top-up response); `onCompleted` fires
 * after a successful submit so the parent can close/refresh.
 */
export function CardOtpDialog({
  handle,
  hint,
  onClose,
  onCompleted,
}: {
  handle: CardOtpHandle | null
  hint?: string | null
  onClose: () => void
  onCompleted?: () => void
}) {
  const [otp, setOtp] = useState("")
  const submit = useSubmitCardOtp()
  const cancel = useCancelCardOtp()
  const succeededRef = useRef(false)
  const valid = /^\d{4,8}$/.test(otp)

  // The dialog persists between charges — clear the success flag each time a new
  // OTP flow opens, so abandoning THIS one still cancels it.
  useEffect(() => {
    if (handle) succeededRef.current = false
  }, [handle])

  /** Dismiss the OTP step. If it was NOT completed, abandon the charge so its
   *  still-PENDING attempt is failed and an immediate retry isn't blocked. */
  function close() {
    if (handle && !succeededRef.current) {
      cancel.mutate({ orderReference: handle.orderReference }) // fire-and-forget
    }
    setOtp("")
    submit.reset()
    onClose()
  }

  function handleSubmit() {
    if (!handle || !valid) return
    submit.mutate(
      { orderReference: handle.orderReference, transactionId: handle.transactionId, otp },
      {
        onSuccess: () => {
          succeededRef.current = true
          setOtp("")
          submit.reset()
          onClose()
          onCompleted?.()
        },
      }
    )
  }

  return (
    <Dialog open={handle !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter the OTP to finish</DialogTitle>
          <DialogDescription>
            {hint?.trim()
              ? hint
              : "Your bank sent a one-time code to authorize this card payment. Enter it to complete the charge."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            inputMode="numeric"
            autoFocus
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="text-center font-su-mono text-su-title-md tracking-[0.3em]"
          />

          {submit.isError && (
            <p className="font-su-sans text-su-caption text-destructive">
              {(submit.error as Error)?.message || "That code wasn't accepted. Try again."}
            </p>
          )}

          <Button
            className="w-full rounded-su-pill"
            disabled={!valid || submit.isPending}
            onClick={handleSubmit}
          >
            {submit.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Confirm payment
          </Button>
          <p className="text-center font-su-sans text-su-caption-sm text-su-muted">
            Didn&apos;t get a code? Close this and try the payment again.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

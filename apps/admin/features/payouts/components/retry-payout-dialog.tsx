"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { useRetryPayoutMutation } from "../mutations/use-retry-payout"

interface RetryPayoutDialogProps {
  payoutId: string
  amountMinor: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RetryPayoutDialog({
  payoutId,
  amountMinor,
  open,
  onOpenChange,
}: RetryPayoutDialogProps) {
  const mutation = useRetryPayoutMutation(payoutId)
  const amountNaira = (amountMinor / 100).toLocaleString("en-NG")

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retry Payout Request</AlertDialogTitle>
          <AlertDialogDescription>
            You are recording an intent to retry the failed payout of ₦{amountNaira}. 
            <br /><br />
            <strong>Note:</strong> This action <strong>only records a retry request</strong> in the audit log for an operator to manually process later. It will <strong>not</strong> automatically call Nomba to re-send the payout.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(e) => {
              e.preventDefault()
              mutation.mutate(undefined, {
                onSuccess: () => onOpenChange(false),
              })
            }}
          >
            {mutation.isPending ? "Recording..." : "Record Request"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

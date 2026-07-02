"use client"

import { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { WithdrawalAccountForm } from "../forms/withdrawal-account"

export function WithdrawalAccountModal({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Set up your withdrawal account</DialogTitle>
          <DialogDescription>
            Where should we send your payouts when it&apos;s your turn to collect?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <WithdrawalAccountForm onSuccess={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

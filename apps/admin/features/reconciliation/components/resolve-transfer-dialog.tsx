"use client"

import { useState } from "react"
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
import { useResolveTransferMutation } from "../mutations/use-resolve-transfer"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

interface ResolveTransferDialogProps {
  transferId: string
  amountMinor: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ResolveTransferDialog({
  transferId,
  amountMinor,
  open,
  onOpenChange,
}: ResolveTransferDialogProps) {
  const mutation = useResolveTransferMutation(transferId)
  
  const [matchedCycleId, setMatchedCycleId] = useState("")
  const [matchedMembershipId, setMatchedMembershipId] = useState("")

  const amountNaira = (amountMinor / 100).toLocaleString("en-NG")

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resolve Transfer</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to manually resolve this unmatched transfer of ₦{amountNaira}? 
            This will remove it from the exception queue and record the manual attribution. 
            <strong>Note: This does not automatically update cycle pots.</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cycleId">Matched Cycle ID (Optional)</Label>
            <Input 
              id="cycleId" 
              value={matchedCycleId} 
              onChange={(e) => setMatchedCycleId(e.target.value)}
              placeholder="cuid..."
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="membershipId">Matched Membership ID (Optional)</Label>
            <Input 
              id="membershipId" 
              value={matchedMembershipId} 
              onChange={(e) => setMatchedMembershipId(e.target.value)}
              placeholder="cuid..."
            />
            <p className="text-xs text-su-muted">
              If provided, Cycle ID is required.
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending || (!!matchedMembershipId && !matchedCycleId)}
            onClick={(e) => {
              e.preventDefault()
              mutation.mutate({ 
                matchedCycleId: matchedCycleId || undefined, 
                matchedMembershipId: matchedMembershipId || undefined 
              }, {
                onSuccess: () => onOpenChange(false),
              })
            }}
          >
            {mutation.isPending ? "Resolving..." : "Resolve"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

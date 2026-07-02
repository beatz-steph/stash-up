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
import { useBlockUserMutation } from "../mutations/use-block-user"

interface UserBlockDialogProps {
  userId: string
  userName: string
  currentlyBlocked: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserBlockDialog({
  userId,
  userName,
  currentlyBlocked,
  open,
  onOpenChange,
}: UserBlockDialogProps) {
  const mutation = useBlockUserMutation(userId)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {currentlyBlocked ? "Unblock User" : "Block User"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {currentlyBlocked
              ? `Are you sure you want to unblock ${userName}? They will be able to create and join circles again.`
              : `Are you sure you want to block ${userName}? They will no longer be able to create or join circles, but their existing active circle balances will remain untouched.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(e) => {
              e.preventDefault()
              mutation.mutate(!currentlyBlocked, {
                onSuccess: () => onOpenChange(false),
              })
            }}
            className={currentlyBlocked ? "" : "bg-su-semantic-down hover:bg-su-semantic-down/90"}
          >
            {mutation.isPending ? "Applying..." : currentlyBlocked ? "Unblock" : "Block"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

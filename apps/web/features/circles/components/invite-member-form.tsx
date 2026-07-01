"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AtSign, Loader2, UserPlus } from "lucide-react"

import { InviteReqSchema } from "@/app/api/circles/dto/circles.dto"
import { useInviteToCircle } from "../mutations"
import { toast } from "@workspace/ui/components/sonner"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

type FormValues = z.infer<typeof InviteReqSchema>

export function InviteMemberDialog({ circleId }: { circleId: string }) {
  const [open, setOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { mutate: inviteMember, isPending } = useInviteToCircle(circleId)

  const form = useForm<FormValues>({
    resolver: zodResolver(InviteReqSchema),
    defaultValues: { username: "" },
  })

  function onSubmit(data: FormValues) {
    setErrorMsg(null)
    inviteMember(data, {
      onSuccess: () => {
        toast.success(`Invite sent to @${data.username}`)
        form.reset()
        setOpen(false)
      },
      onError: (error) => {
        setErrorMsg(error.message || "Failed to invite user")
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setErrorMsg(null)
          form.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full rounded-su-pill">
          <UserPlus className="mr-2 h-4 w-4" />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-su-display tracking-tight">Invite a member</DialogTitle>
          <DialogDescription>
            Enter the username of the person you want to invite. They'll get a
            notification and the invite expires in 7 days.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <Alert variant="destructive">
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-su-muted" />
                      <Input className="pl-9" placeholder="username" autoComplete="off" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-su-pill"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-su-pill" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

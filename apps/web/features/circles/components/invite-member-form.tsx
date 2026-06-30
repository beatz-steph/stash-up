"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"

import { InviteReqSchema } from "@/app/api/circles/dto/circles.dto"
import { useInviteToCircle } from "../mutations"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

type FormValues = z.infer<typeof InviteReqSchema>

export function InviteMemberForm({ circleId }: { circleId: string }) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { mutate: inviteMember, isPending } = useInviteToCircle(circleId)

  const form = useForm<FormValues>({
    resolver: zodResolver(InviteReqSchema),
    defaultValues: {
      username: "",
    },
  })

  function onSubmit(data: FormValues) {
    setErrorMsg(null)
    inviteMember(data, {
      onSuccess: () => {
        form.reset()
      },
      onError: (error) => {
        setErrorMsg(error.message || "Failed to invite user")
      },
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="font-su-sans text-su-body font-semibold">Invite Member</h3>
      {errorMsg && (
        <Alert variant="destructive">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input placeholder="Enter username..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Invite
          </Button>
        </form>
      </Form>
    </div>
  )
}

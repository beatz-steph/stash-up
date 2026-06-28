import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { authClient } from "../../../../lib/auth-client"
import { useState } from "react"
import { toast } from "@workspace/ui/components/sonner"

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
})

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export function useForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(true)
    try {
      const { error } = await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        toast.error(error.message || "Failed to send reset email")
        return
      }
      setIsSuccess(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  })

  return { form, onSubmit, isLoading, isSuccess }
}

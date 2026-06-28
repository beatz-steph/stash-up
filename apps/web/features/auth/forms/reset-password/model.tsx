import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@workspace/ui/components/sonner"
import { authClient } from "../../../../lib/auth-client"

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export function useResetPasswordForm(token?: string) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    if (!token) {
      toast.error("This reset link is invalid or has expired. Request a new one.")
      return
    }
    setIsLoading(true)
    try {
      const { error } = await authClient.resetPassword({
        newPassword: values.password,
        token,
      })
      if (error) {
        toast.error(error.message || "Failed to reset password")
        return
      }
      toast.success("Password updated — please sign in")
      router.push("/sign-in")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  })

  return { form, onSubmit, isLoading }
}

import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@workspace/ui/components/sonner"
import { authClient } from "../../../../lib/auth-client"

export const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

export type SignInFormValues = z.infer<typeof signInSchema>

export function useSignInForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(true)
    try {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      })
      if (error) {
        toast.error(error.message || "Invalid email or password")
        setIsLoading(false)
        return
      }
      router.push("/")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred")
      setIsLoading(false)
    }
  })

  return { form, onSubmit, isLoading }
}

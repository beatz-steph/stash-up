import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { authClient } from "../../../../lib/auth-client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

export type SignInFormValues = z.infer<typeof signInSchema>

export function useSignInForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(true)
    setError(null)
    try {
      const { error: authError } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      })
      if (authError) {
        setError(authError.message || "Invalid email or password")
      } else {
        router.push("/")
        router.refresh()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  })

  return {
    form,
    onSubmit,
    isLoading,
    error,
  }
}

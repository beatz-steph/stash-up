import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { authClient } from "../../../../lib/auth-client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export const signUpSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain alphanumeric characters and underscores")
    .transform((val: string) => val.toLowerCase()),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

export type SignUpFormValues = z.infer<typeof signUpSchema>

export function useSignUpForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: "",
      name: "",
      username: "",
      password: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(true)
    setError(null)
    try {
      const { error: authError } = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: values.name,
        username: values.username, // custom field passed to better-auth
      })
      if (authError) {
        setError(authError.message || "Failed to create account")
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

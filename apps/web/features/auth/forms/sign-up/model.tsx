import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@workspace/ui/components/sonner"
import { authClient } from "../../../../lib/auth-client"
import { useUsernameAvailability } from "../../queries/use-username-availability"

export const signUpSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers and underscores",
      )
      .transform((val) => val.toLowerCase()),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export type SignUpFormValues = z.infer<typeof signUpSchema>

/** Fields validated before advancing from step 1 → step 2. */
const STEP_ONE_FIELDS = ["firstName", "lastName", "username", "email"] as const

export function useSignUpForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    mode: "onTouched",
    defaultValues: {
      firstName: "",
      lastName: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const usernameValue = form.watch("username")
  const username = useUsernameAvailability(usernameValue)

  const goToStep2 = async () => {
    const valid = await form.trigger(STEP_ONE_FIELDS)
    if (!valid) return
    if (username.status === "taken") {
      // The live indicator under the field already shows this; just block.
      return
    }
    if (username.status === "checking") {
      toast.message("Hang on — still checking that username")
      return
    }
    if (username.status === "error") {
      toast.error("Couldn't verify the username. Please try again.")
      return
    }
    setStep(2)
  }

  const backToStep1 = () => setStep(1)

  const submitStep2 = form.handleSubmit(async (values) => {
    setIsLoading(true)
    try {
      const { error } = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: `${values.firstName} ${values.lastName}`.trim(),
        username: values.username,
        firstName: values.firstName,
        lastName: values.lastName,
      })
      if (error) {
        toast.error(error.message || "Failed to create account")
        setIsLoading(false)
        return
      }
      toast.success("Account created — welcome to StashUp!")
      router.push("/")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred")
      setIsLoading(false)
    }
  })

  // Single form submit handler: advances on step 1, creates the account on step 2.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (step === 1) {
      event.preventDefault()
      void goToStep2()
      return
    }
    void submitStep2(event)
  }

  return {
    form,
    onSubmit,
    isLoading,
    step,
    backToStep1,
    usernameStatus: username.status,
  }
}

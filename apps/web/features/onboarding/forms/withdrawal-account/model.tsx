"use client"

import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
import { resolveAccountName } from "@/lib/api/data/withdrawal-account"
import { useBanks } from "../../queries/use-banks"
import { useSaveWithdrawalAccount } from "../../mutations/use-save-withdrawal-account"

export const withdrawalAccountSchema = z.object({
  bankCode: z.string().min(1, "Please select a bank"),
  accountNumber: z
    .string()
    .length(10, "Account number must be exactly 10 digits")
    .regex(/^\d+$/, "Account number must contain only numbers"),
  accountName: z.string().min(1, "Account name must be verified"),
})

export type WithdrawalAccountFormValues = z.infer<typeof withdrawalAccountSchema>

export function useWithdrawalAccountForm() {
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [resolutionError, setResolutionError] = useState<string | null>(null)

  const { data: banks = [], isLoading: isLoadingBanks } = useBanks()
  const saveMutation = useSaveWithdrawalAccount()

  const form = useForm<WithdrawalAccountFormValues>({
    resolver: zodResolver(withdrawalAccountSchema),
    defaultValues: {
      bankCode: "",
      accountNumber: "",
      accountName: "",
    },
    mode: "onChange",
  })

  const bankCode = form.watch("bankCode")
  const accountNumber = form.watch("accountNumber")

  // Resolve account name reactively
  useEffect(() => {
    let active = true

    async function resolve() {
      if (!bankCode || accountNumber.length !== 10 || !/^\d+$/.test(accountNumber)) {
        setResolvedName(null)
        setResolutionError(null)
        form.setValue("accountName", "")
        return
      }

      setIsResolving(true)
      setResolutionError(null)
      setResolvedName(null)
      form.setValue("accountName", "")

      try {
        const { accountName } = await resolveAccountName({ bankCode, accountNumber })
        if (active) {
          setResolvedName(accountName)
          form.setValue("accountName", accountName, { shouldValidate: true })
        }
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : "Failed to verify account"
          setResolutionError(message)
          form.setValue("accountName", "")
        }
      } finally {
        if (active) {
          setIsResolving(false)
        }
      }
    }

    resolve()

    return () => {
      active = false
    }
  }, [bankCode, accountNumber, form])

  const onSubmit = form.handleSubmit((values) => {
    const selectedBank = banks.find((b) => b.code === values.bankCode)
    saveMutation.mutate({
      bankCode: values.bankCode,
      bankName: selectedBank ? selectedBank.name : "Unknown Bank",
      accountNumber: values.accountNumber,
      accountName: values.accountName,
    })
  })

  return {
    form,
    onSubmit,
    banks,
    isLoadingBanks,
    isResolving,
    resolvedName,
    resolutionError,
    isSubmitting: saveMutation.isPending,
  }
}

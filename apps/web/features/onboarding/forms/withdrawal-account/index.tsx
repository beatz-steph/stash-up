"use client"

import { Form, FormField, FormItem, FormLabel, FormMessage, FormControl } from "@workspace/ui/components/form"
import { FormInput } from "@workspace/ui/form/input"
import { Button } from "@workspace/ui/components/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { useWithdrawalAccountForm } from "./model"

export function WithdrawalAccountForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const {
    form,
    onSubmit,
    banks,
    isLoadingBanks,
    isResolving,
    resolvedName,
    resolutionError,
    isSubmitting,
  } = useWithdrawalAccountForm({ onSuccess })

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-5">
          <FormField
            control={form.control}
            name="bankCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bank</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isLoadingBanks || isSubmitting}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoadingBanks ? "Loading banks..." : "Select bank"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="z-50">
                    {banks.map((bank) => (
                      <SelectItem
                        key={bank.code}
                        value={bank.code}
                        className="cursor-pointer"
                      >
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormInput
            control={form.control}
            name="accountNumber"
            label="Account Number"
            type="text"
            placeholder="0123456789"
            maxLength={10}
            disabled={isSubmitting}
          />

          {isResolving && (
            <div className="text-su-caption text-su-muted flex items-center gap-1.5 py-1">
              <svg className="animate-spin h-3.5 w-3.5 text-su-primary" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Verifying account...</span>
            </div>
          )}

          {resolutionError && (
            <div className="rounded-su-md border border-su-semantic-down/15 bg-su-semantic-down/5 p-3 text-left text-su-caption font-semibold text-su-semantic-down">
              {resolutionError}
            </div>
          )}

          {resolvedName && (
            <div className="bg-su-surface-soft rounded-su-md p-3 border border-su-hairline-soft flex flex-col space-y-0.5">
              <span className="font-su-sans text-su-caption-sm text-su-muted uppercase tracking-wider font-semibold">
                Account Holder Name
              </span>
              <span className="font-su-sans text-su-title-sm font-semibold text-su-ink">
                {resolvedName}
              </span>
            </div>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || !resolvedName || isResolving}
        >
          {isSubmitting ? "Saving..." : "Save withdrawal account"}
        </Button>
      </form>
    </Form>
  )
}

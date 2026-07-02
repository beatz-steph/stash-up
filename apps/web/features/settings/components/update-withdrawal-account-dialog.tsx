"use client"

import { useEffect, useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useBanks } from "@/features/onboarding/queries/use-banks"
import { resolveAccountName } from "@/lib/api/data/withdrawal-account"
import {
  useRequestWithdrawalOtp,
  useUpdateWithdrawalAccount,
} from "../mutations/use-withdrawal-account"

type Step = "details" | "verify"

export function UpdateWithdrawalAccountDialog() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("details")

  const [bankCode, setBankCode] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [otp, setOtp] = useState("")

  const { data: banks = [], isLoading: isLoadingBanks } = useBanks()
  const requestOtp = useRequestWithdrawalOtp()
  const update = useUpdateWithdrawalAccount(() => reset())

  function reset() {
    setOpen(false)
    setStep("details")
    setBankCode("")
    setAccountNumber("")
    setResolvedName(null)
    setResolveError(null)
    setOtp("")
  }

  // Resolve the account name from Nomba once bank + 10-digit number are entered.
  useEffect(() => {
    let active = true
    if (!bankCode || accountNumber.length !== 10 || !/^\d{10}$/.test(accountNumber)) {
      setResolvedName(null)
      setResolveError(null)
      return
    }
    setIsResolving(true)
    setResolveError(null)
    setResolvedName(null)
    resolveAccountName({ bankCode, accountNumber })
      .then(({ accountName }) => {
        if (active) setResolvedName(accountName)
      })
      .catch((err) => {
        if (active) setResolveError(err instanceof Error ? err.message : "Could not verify account")
      })
      .finally(() => {
        if (active) setIsResolving(false)
      })
    return () => {
      active = false
    }
  }, [bankCode, accountNumber])

  const selectedBank = banks.find((b) => b.code === bankCode)

  async function handleSendCode() {
    const res = await requestOtp.mutateAsync().catch(() => null)
    if (res) setStep("verify")
  }

  function handleConfirm() {
    if (!resolvedName || !selectedBank) return
    update.mutate({
      bankCode,
      bankName: selectedBank.name,
      accountNumber,
      accountName: resolvedName,
      otp,
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        else setOpen(true)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-su-pill">
          Update
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "details" ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-su-sans">Update payout account</DialogTitle>
              <DialogDescription className="font-su-sans text-su-muted">
                Enter the new account. We&apos;ll email you a code to confirm the change.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="font-su-sans">Bank</Label>
                <Select value={bankCode} onValueChange={setBankCode} disabled={isLoadingBanks}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isLoadingBanks ? "Loading banks..." : "Select bank"} />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    {banks.map((bank) => (
                      <SelectItem key={bank.code} value={bank.code} className="cursor-pointer">
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="font-su-sans">Account number</Label>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
              </div>

              {isResolving && (
                <p className="flex items-center gap-2 font-su-sans text-su-caption text-su-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying account…
                </p>
              )}
              {resolvedName && (
                <p className="font-su-sans text-su-caption font-semibold text-su-semantic-up">
                  {resolvedName}
                </p>
              )}
              {resolveError && (
                <p className="font-su-sans text-su-caption text-su-semantic-down">{resolveError}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                className="w-full rounded-su-pill"
                disabled={!resolvedName || requestOtp.isPending}
                onClick={handleSendCode}
              >
                {requestOtp.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send confirmation code
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-su-sans">
                <ShieldCheck className="h-4 w-4 text-su-primary" /> Confirm the change
              </DialogTitle>
              <DialogDescription className="font-su-sans text-su-muted">
                Enter the 6-digit code we emailed you. New account:{" "}
                <span className="font-semibold text-su-ink">{resolvedName}</span> ·{" "}
                {selectedBank?.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="______"
                className="text-center font-su-mono text-su-title-md tracking-[0.5em]"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <button
                type="button"
                className="font-su-sans text-su-caption text-su-primary hover:underline disabled:opacity-50"
                disabled={requestOtp.isPending}
                onClick={() => requestOtp.mutate()}
              >
                Resend code
              </button>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                className="rounded-su-pill"
                onClick={() => setStep("details")}
                disabled={update.isPending}
              >
                Back
              </Button>
              <Button
                className="rounded-su-pill"
                disabled={otp.length !== 6 || update.isPending}
                onClick={handleConfirm}
              >
                {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm change
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

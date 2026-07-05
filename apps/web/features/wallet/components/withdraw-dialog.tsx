"use client"

import { useState } from "react"
import { Loader2, ArrowUpRight } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { formatNaira } from "@/lib/money"
import { transferFeeMinor } from "@/lib/fees"
import { usePinStatus } from "../queries"
import { useSetWalletPin, useWithdrawFromWallet } from "../mutations"
import { PinField, PIN_LENGTH } from "./pin-field"

export function WithdrawDialog({ balanceMinor }: { balanceMinor: number }) {
  const [open, setOpen] = useState(false)
  const { data: pinStatus, isLoading: pinLoading } = usePinStatus()
  const setPin = useSetWalletPin()
  const withdraw = useWithdrawFromWallet()

  const [newPin, setNewPin] = useState("")
  const [amount, setAmount] = useState("")
  const [pin, setPin_] = useState("")

  const amountMinor = Math.round((Number(amount) || 0) * 100)
  const feeMinor = amountMinor > 0 ? transferFeeMinor(amountMinor) : 0
  const totalMinor = amountMinor + feeMinor
  const amountValid = amountMinor > 0 && totalMinor <= balanceMinor
  const pinValid = pin.length === PIN_LENGTH
  const newPinValid = newPin.length === PIN_LENGTH

  function reset() {
    setNewPin("")
    setAmount("")
    setPin_("")
  }

  async function handleWithdraw() {
    const res = await withdraw.mutateAsync({ amountMinor, pin }).catch(() => null)
    if (res) {
      reset()
      setOpen(false)
    }
  }

  const needsPin = !pinLoading && pinStatus && !pinStatus.isSet

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowUpRight className="mr-2 h-4 w-4" />
          Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw to your bank</DialogTitle>
          <DialogDescription>
            {needsPin
              ? "Set a transaction PIN to secure withdrawals."
              : "Money is sent to your linked withdrawal account."}
          </DialogDescription>
        </DialogHeader>

        {pinLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-su-muted" />
          </div>
        ) : needsPin ? (
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="block text-center">Choose a {PIN_LENGTH}-digit PIN</Label>
              <PinField
                value={newPin}
                onChange={setNewPin}
                autoFocus
                disabled={setPin.isPending}
              />
            </div>
            <DialogFooter className="flex sm:justify-center">
              <Button
                disabled={!newPinValid || setPin.isPending}
                onClick={() => setPin.mutate(newPin, { onSuccess: () => setNewPin("") })}
              >
                {setPin.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Set PIN
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wd-amount">Amount (₦)</Label>
              <Input
                id="wd-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount to receive"
              />
              {amountMinor > 0 && (
                <p className="font-su-sans text-su-caption text-su-muted">
                  {formatNaira(feeMinor)} transfer fee · {formatNaira(totalMinor)} debited from your
                  wallet.
                  {totalMinor > balanceMinor ? " Exceeds your balance." : ""}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="block text-center">Transaction PIN</Label>
              <PinField value={pin} onChange={setPin_} disabled={withdraw.isPending} />
            </div>
            <DialogFooter className="flex sm:justify-center">
              <Button
                disabled={!amountValid || !pinValid || withdraw.isPending}
                onClick={handleWithdraw}
              >
                {withdraw.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Withdraw {amountValid ? formatNaira(amountMinor) : ""}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

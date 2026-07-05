"use client"

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"

/** Wallet transaction PIN length — segmented OTP-style entry. */
export const PIN_LENGTH = 4

/** Segmented digit entry for the wallet PIN (setup + withdrawal approval).
 * Sanitizes to digits and masks entered digits with a dot. */
export function PinField({
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  autoFocus?: boolean
  disabled?: boolean
}) {
  return (
    <InputOTP
      maxLength={PIN_LENGTH}
      value={value}
      onChange={(v) => onChange(v.replace(/\D/g, ""))}
      onComplete={onComplete}
      inputMode="numeric"
      autoFocus={autoFocus}
      disabled={disabled}
      containerClassName="justify-center"
    >
      <InputOTPGroup>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div key={i} className="relative">
            {/* Hide the real digit; overlay a masking dot once filled. */}
            <InputOTPSlot index={i} className="text-transparent" />
            {i < value.length && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-su-mono text-su-title-md text-su-ink">
                •
              </span>
            )}
          </div>
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}

"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

interface DatePickerProps {
  value?: Date
  onChange: (date?: Date) => void
  placeholder?: string
  disabled?: boolean
  /** Disable any day before today (for future-only deadlines). */
  fromToday?: boolean
}

/**
 * Reusable single-date picker (shadcn Calendar inside a Popover). Drop into a
 * react-hook-form FormField via `field.value` / `field.onChange`.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  fromToday,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-12 w-full justify-start rounded-su-md border-su-hairline bg-su-canvas px-4 font-su-sans text-su-body-md font-normal",
            !value && "text-su-muted",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-su-muted" />
          {value
            ? value.toLocaleDateString("en-NG", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date)
            if (date) setOpen(false)
          }}
          disabled={fromToday ? { before: today } : undefined}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, X } from "lucide-react"

const ACK_KEY = "stashup:real-money-ack"

/**
 * Dismissible banner reminding users that StashUp moves real money. Rendered by
 * the dashboard shell only in production (the server layout gates on NODE_ENV).
 * Acknowledgement is remembered in localStorage so it shows once.
 */
export function RealMoneyNotice() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(ACK_KEY) !== "1") setShow(true)
    } catch {
      setShow(true)
    }
  }, [])

  if (!show) return null

  function dismiss() {
    try {
      localStorage.setItem(ACK_KEY, "1")
    } catch {
      // ignore — worst case the banner shows again next load
    }
    setShow(false)
  }

  return (
    <div className="flex items-start gap-3 border-b border-su-primary/20 bg-su-primary/[0.06] px-su-lg py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-su-primary" />
      <p className="flex-1 font-su-sans text-su-caption text-su-ink">
        Heads up: StashUp handles <span className="font-semibold">real money</span>. Contributions and
        payouts are actual transactions to and from real bank accounts. Only contribute what you can
        afford.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-su-full p-1 text-su-muted hover:bg-su-primary/10 hover:text-su-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

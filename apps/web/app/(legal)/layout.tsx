import Link from "next/link"
import Image from "next/image"
import { ReactNode } from "react"

/** Shared shell for the public legal pages (Terms, Privacy) — simple readable
 * container with a header back to the landing page and a light footer. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-su-canvas">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-su-lg py-5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="StashUp" width={24} height={24} className="h-6 w-6" />
          <span className="font-su-display text-su-title-md font-semibold tracking-tight text-su-ink">
            StashUp
          </span>
        </Link>
        <Link
          href="/"
          className="font-su-sans text-su-caption font-semibold text-su-muted hover:text-su-ink"
        >
          ← Back home
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-su-lg pb-20 pt-6">{children}</main>
    </div>
  )
}

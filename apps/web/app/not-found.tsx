import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Search } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-su-canvas p-6 text-center space-y-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-su-full bg-su-surface-raised border border-su-border shadow-sm">
        <Search className="h-8 w-8 text-su-muted" />
      </div>
      <div className="space-y-2 max-w-md">
        <h1 className="font-su-display text-su-title-lg font-bold text-su-ink">Page not found</h1>
        <p className="font-su-sans text-su-body-md text-su-muted">
          We couldn't find the page you were looking for. It might have been moved or doesn't exist.
        </p>
      </div>
      <Button asChild size="lg" variant="outline">
        <Link href="/">
          Return Home
        </Link>
      </Button>
    </div>
  )
}

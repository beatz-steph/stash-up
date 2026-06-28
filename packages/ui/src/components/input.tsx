import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-su-md border border-su-hairline bg-su-canvas px-4 py-1 text-su-body-md text-su-ink transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-su-ink placeholder:text-su-muted focus-visible:border-su-primary focus-visible:ring-[3px] focus-visible:ring-su-primary/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-su-semantic-down aria-invalid:ring-[3px] aria-invalid:ring-su-semantic-down/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }

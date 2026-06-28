import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[96px] w-full resize-none rounded-su-md border border-su-hairline bg-su-canvas px-4 py-3 text-su-body transition-colors outline-none placeholder:text-su-muted focus-visible:border-su-primary focus-visible:ring-[3px] focus-visible:ring-su-primary/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-su-semantic-down aria-invalid:ring-[3px] aria-invalid:ring-su-semantic-down/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

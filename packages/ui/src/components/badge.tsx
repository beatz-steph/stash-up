import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-su-pill border border-transparent px-2.5 py-0.5 text-su-caption-sm font-semibold whitespace-nowrap transition-all focus-visible:border-su-primary focus-visible:ring-[3px] focus-visible:ring-su-primary/20 has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 aria-invalid:border-su-semantic-down aria-invalid:ring-su-semantic-down/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-su-primary text-su-on-primary [a]:hover:bg-su-primary-active",
        secondary:
          "bg-su-surface-strong text-su-ink [a]:hover:bg-su-surface-strong/80",
        destructive:
          "bg-su-semantic-down/10 text-su-semantic-down focus-visible:ring-su-semantic-down/20 [a]:hover:bg-su-semantic-down/20",
        outline:
          "border-su-hairline bg-su-canvas text-su-ink [a]:hover:bg-su-surface-soft [a]:hover:text-su-muted",
        ghost:
          "hover:bg-su-surface-soft hover:text-su-muted",
        link: "text-su-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

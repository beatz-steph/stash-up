import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-su-pill border border-transparent bg-clip-padding text-su-button font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-su-primary focus-visible:ring-[3px] focus-visible:ring-su-primary/20 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-su-semantic-down aria-invalid:ring-[3px] aria-invalid:ring-su-semantic-down/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-su-primary text-su-on-primary hover:bg-su-primary-active",
        outline:
          "border-su-hairline bg-su-canvas hover:bg-su-surface-soft hover:text-su-ink aria-expanded:bg-su-surface-soft aria-expanded:text-su-ink",
        secondary:
          "bg-su-surface-strong text-su-ink hover:bg-su-surface-strong/80 aria-expanded:bg-su-surface-strong aria-expanded:text-su-ink",
        ghost:
          "hover:bg-su-surface-soft hover:text-su-ink aria-expanded:bg-su-surface-soft aria-expanded:text-su-ink",
        destructive:
          "bg-su-semantic-down/10 text-su-semantic-down hover:bg-su-semantic-down/20 focus-visible:border-su-semantic-down/40 focus-visible:ring-su-semantic-down/20",
        link: "text-su-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-6 has-data-[icon=inline-end]:pe-4 has-data-[icon=inline-start]:ps-4",
        xs: "h-7 gap-1 px-3 text-su-caption-sm has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pe-3 has-data-[icon=inline-start]:ps-3",
        lg: "h-14 gap-2 px-8 has-data-[icon=inline-end]:pe-6 has-data-[icon=inline-start]:ps-6",
        icon: "size-11",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

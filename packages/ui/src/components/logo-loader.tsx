import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

export interface LogoLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl"
  fullPage?: boolean
}

export function LogoLoader({ className, size = "md", fullPage = false, ...props }: LogoLoaderProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-24 w-24"
  }

  const content = (
    <div 
      className={cn(
        "flex shrink-0 items-center justify-center animate-pulse",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      <img src="/logo.svg" alt="Loading..." className="h-full w-full object-contain" />
    </div>
  )

  if (fullPage) {
    return (
      <div className="flex min-h-[50vh] h-full w-full flex-col items-center justify-center bg-transparent space-y-4">
        {content}
      </div>
    )
  }

  return content
}

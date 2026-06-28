"use client"

import * as React from "react"
import { Moon, Sun, Monitor, Check } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="h-10 w-10 rounded-su-full bg-su-canvas border-su-hairline text-su-ink shadow-sm hover:bg-su-surface-soft transition-colors"
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-su-surface-card border-su-hairline text-su-ink rounded-su-lg shadow-lg p-1.5 w-40 font-su-sans">
        <DropdownMenuItem 
          onClick={() => setTheme("light")} 
          className="cursor-pointer flex items-center gap-2.5 rounded-su-md px-2.5 py-2 text-su-body-md transition-colors focus:bg-su-surface-soft focus:text-su-ink outline-none"
        >
          <Sun className="h-4 w-4 text-su-muted" />
          <span className="flex-1 font-medium">Light</span>
          {theme === "light" && <Check className="h-4 w-4 text-su-primary" />}
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => setTheme("dark")} 
          className="cursor-pointer flex items-center gap-2.5 rounded-su-md px-2.5 py-2 text-su-body-md transition-colors focus:bg-su-surface-soft focus:text-su-ink outline-none"
        >
          <Moon className="h-4 w-4 text-su-muted" />
          <span className="flex-1 font-medium">Dark</span>
          {theme === "dark" && <Check className="h-4 w-4 text-su-primary" />}
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => setTheme("system")} 
          className="cursor-pointer flex items-center gap-2.5 rounded-su-md px-2.5 py-2 text-su-body-md transition-colors focus:bg-su-surface-soft focus:text-su-ink outline-none"
        >
          <Monitor className="h-4 w-4 text-su-muted" />
          <span className="flex-1 font-medium">System</span>
          {theme === "system" && <Check className="h-4 w-4 text-su-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

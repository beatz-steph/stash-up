import { Cal_Sans, Inter, Geist_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Providers } from "@/components/providers"
import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const calSans = Cal_Sans({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-cal-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", inter.variable, calSans.variable, fontMono.variable, "font-sans")}
    >
      <body>
        <ThemeProvider>
          <Providers>
            {children}
            <Toaster richColors />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}

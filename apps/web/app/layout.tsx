import type { Metadata } from "next"
import localFont from "next/font/local"
import { Geist_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Providers } from "@/components/providers"
import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils";

const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Variable.woff2", weight: "300 900", style: "normal" },
    { path: "./fonts/Satoshi-VariableItalic.woff2", weight: "300 900", style: "italic" },
  ],
  variable: "--font-sans",
  display: "swap",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stashup.xyz"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "StashUp — Save together, get paid in turns",
    template: "%s · StashUp",
  },
  description:
    "StashUp is a digital Ajo/Esusu — join a trusted savings circle, contribute each cycle, and take your payout when it's your turn. Bank-grade rails, automatic reconciliation, real payouts.",
  applicationName: "StashUp",
  keywords: [
    "Ajo",
    "Esusu",
    "ROSCA",
    "rotating savings",
    "savings circle",
    "thrift",
    "digital thrift",
    "group savings",
    "Nigeria savings",
  ],
  authors: [{ name: "StashUp" }],
  openGraph: {
    type: "website",
    siteName: "StashUp",
    url: siteUrl,
    title: "StashUp — Save together, get paid in turns",
    description:
      "Join a trusted savings circle, contribute each cycle, and collect the full pot when it's your turn. Real payouts on bank-grade rails.",
  },
  twitter: {
    card: "summary_large_image",
    title: "StashUp — Save together, get paid in turns",
    description:
      "Digital Ajo/Esusu savings circles with automatic reconciliation and real payouts.",
  },
  icons: [
    { rel: "icon", type: "image/svg+xml", url: "/icon.svg", media: "(prefers-color-scheme: light)" },
    { rel: "icon", type: "image/svg+xml", url: "/icon-dark.svg", media: "(prefers-color-scheme: dark)" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", satoshi.variable, fontMono.variable, "font-sans")}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            {children}
            <Toaster richColors />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}

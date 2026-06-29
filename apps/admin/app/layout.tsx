import type { Metadata } from "next";
import localFont from "next/font/local"
import { Geist_Mono } from "next/font/google"
import "@workspace/ui/globals.css";
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

export const metadata: Metadata = {
  title: "StashUp Admin",
  description: "Platform management for StashUp Savings Circles",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased h-full", satoshi.variable, fontMono.variable, "font-sans")}
    >
      <body className="min-h-full bg-su-surface-soft text-su-ink font-su-sans">
        <ThemeProvider attribute="class" forcedTheme="light">
          <Providers>
            {children}
            <Toaster richColors />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}

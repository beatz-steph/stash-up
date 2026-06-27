import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google"
import "@workspace/ui/globals.css";
import { ThemeProvider } from "@/components/theme-provider"
import { Providers } from "@/components/providers"
import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Stashup Admin",
  description: "Platform management for Stashup Savings Circles",
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
      className={cn("antialiased h-full", fontMono.variable, "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        <ThemeProvider>
          <Providers>
            {children}
            <Toaster richColors />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}

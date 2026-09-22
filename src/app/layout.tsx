import type { Metadata } from "next"
import localFont from "next/font/local"
import { Toaster } from "sonner"
import { ThemeProvider } from "next-themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NavigationProgress } from "@/components/layout/navigation-progress"
import "./globals.css"

// Self-hosted from ./fonts rather than next/font/google: the Google loader
// downloads the .woff2 from fonts.gstatic.com during the build, which makes
// every deployment depend on that fetch succeeding. See ./fonts/README.md.
const jakartaSans = localFont({
  src: "./fonts/PlusJakartaSans-Variable.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-sans",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
})

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-geist-mono",
  // Arial's metrics are the only sans option and would size a monospace
  // fallback badly, so no size-adjust is better than the wrong one.
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
})

export const metadata: Metadata = {
  title: "MTOP System — LGU Ozamiz City",
  description:
    "Motorized Tricycle Operator's Permit Renewal System for LGU Ozamiz City",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${jakartaSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <NavigationProgress />
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

"use client"

import { createPortal } from "react-dom"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Covers the screen while a decision is being recorded.
 *
 * Moving an application on is one irreversible write plus, at grant, a whole
 * chain of them — a number issued, a unit replaced, an owner transferred. A
 * disabled button alone still leaves the rest of the page live, so a clerk can
 * tick a requirement or start a payment against a record the server is in the
 * middle of changing, and only find out when the page refreshes underneath
 * them. This blocks the pointer over everything, including the sidebar, and
 * the page behind it goes `inert` so nothing can be reached by keyboard
 * either.
 *
 * It stays up until the refreshed page has actually arrived, not merely until
 * the action returned — see the transition around router.refresh() in
 * application-detail.tsx.
 *
 * Rendered into `document.body` so that the `inert` page can hold it as a
 * child in JSX without making it inert too — an overlay nobody can read is
 * not much of an overlay.
 */
export function BusyOverlay({
  label,
  detail,
  className,
}: {
  label: string
  detail?: string
  className?: string
}) {
  // Only ever mounted in response to a click, so there is no server render to
  // guard against — the check is here for the one that would surprise us.
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      // Above the sidebar (z-50) and below the navigation progress bar
      // (z-[9999]), which should stay visible while this is up.
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-background/60 supports-backdrop-filter:backdrop-blur-[2px]",
        className
      )}
      // Announced once, not on a loop: the clerk is told what is happening,
      // not nagged about it.
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-5 py-4 shadow-lg">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div className="text-sm">
          <p className="font-medium">{label}</p>
          {detail && (
            <p className="text-xs text-muted-foreground">{detail}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

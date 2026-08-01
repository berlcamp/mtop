"use client"

import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

export function PrintControls({ mtopNumber }: { mtopNumber: string }) {
  return (
    <div className="no-print flex items-center justify-between gap-4 border-b bg-background px-6 py-3">
      <div className="text-sm">
        <span className="font-medium">Franchise Card</span>
        {mtopNumber && (
          <span className="text-muted-foreground"> — {mtopNumber}</span>
        )}
        <p className="text-xs text-muted-foreground">
          Print on 8.5 × 13 in (long bond) at 100% scale, background graphics on.
        </p>
      </div>
      <Button onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Print
      </Button>
    </div>
  )
}

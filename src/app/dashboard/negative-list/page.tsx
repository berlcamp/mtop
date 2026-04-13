import { Suspense } from "react"
import { NegativeListContent } from "./negative-list-content"

export default function NegativeListPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          Loading negative list...
        </div>
      }
    >
      <NegativeListContent />
    </Suspense>
  )
}

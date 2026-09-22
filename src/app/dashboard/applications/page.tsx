import { Suspense } from "react"
import { PageHeader } from "@/components/layout/page-header"
import { ApplicationsTable } from "./applications-table"
import { NewApplicationButton } from "./new-application-button"

export default function ApplicationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        subtitle="Manage MTOP renewal applications"
        actions={<NewApplicationButton />}
      />

      {/* The table owns the filters and reads them from the URL, so it needs a
          boundary of its own for useSearchParams. */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading applications...
          </div>
        }
      >
        <ApplicationsTable />
      </Suspense>
    </div>
  )
}

import { Suspense } from "react"
import { PageHeader } from "@/components/layout/page-header"
import { ApplicationsTable } from "./applications-table"
import { NewApplicationButton } from "./new-application-button"

export default function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        subtitle="Manage MTOP renewal applications"
        actions={<NewApplicationButton />}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading applications...
          </div>
        }
      >
        <ApplicationsTable searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

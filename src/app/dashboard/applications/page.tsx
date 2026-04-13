import { Suspense } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ApplicationsTable } from "./applications-table"

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
        actions={
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/dashboard/applications/new" />}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Application
          </Button>
        }
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

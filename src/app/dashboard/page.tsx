import { PageHeader } from "@/components/layout/page-header"
import {
  getDashboardStats,
  getPipelineCounts,
  getRecentActivity,
} from "@/lib/actions/dashboard"
import { DashboardContent } from "./dashboard-content"

export default async function DashboardPage() {
  const [statsResult, pipelineResult, activityResult] = await Promise.all([
    getDashboardStats(),
    getPipelineCounts(),
    getRecentActivity(10),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Motorized Tricycle Operator's Permit Renewal System"
      />

      <DashboardContent
        stats={statsResult.data}
        pipeline={pipelineResult.data}
        activity={activityResult.data}
      />
    </div>
  )
}

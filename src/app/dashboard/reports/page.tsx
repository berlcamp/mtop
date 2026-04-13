import { PageHeader } from "@/components/layout/page-header"
import {
  getApplicationsByStatus,
  getRevenueSummary,
  getMonthlyTrends,
  getLateRenewalStats,
} from "@/lib/actions/reports"
import { ReportsContent } from "./reports-content"

export default async function ReportsPage() {
  const currentYear = new Date().getFullYear()

  const [statusResult, revenueResult, trendsResult, lateResult] =
    await Promise.all([
      getApplicationsByStatus(currentYear),
      getRevenueSummary(currentYear),
      getMonthlyTrends(currentYear),
      getLateRenewalStats(currentYear),
    ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle={`Fiscal Year ${currentYear}`}
      />

      <ReportsContent
        statusCounts={statusResult.data}
        revenueSummary={revenueResult.data}
        monthlyTrends={trendsResult.data}
        lateStats={lateResult.data}
        fiscalYear={currentYear}
      />
    </div>
  )
}

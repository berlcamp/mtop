import { notFound } from "next/navigation"
import { getApplication } from "@/lib/actions/applications"
import { getFranchiseHistory } from "@/lib/actions/audit"
import { getSystemSettings } from "@/lib/actions/settings"
import { ApplicationDetail } from "./application-detail"

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ data, error }, { data: settings }] = await Promise.all([
    getApplication(id),
    getSystemSettings(),
  ])

  if (error || !data) {
    notFound()
  }

  // A condensed slice of the franchise's audit trail, so a clerk working a
  // transaction can see what was recently changed on the record without
  // leaving the page. The full trail lives on /dashboard/franchises/[id].
  const { data: franchiseHistory } = await getFranchiseHistory(
    data.franchise_id,
    6
  )

  return (
    <ApplicationDetail
      application={data}
      settings={settings}
      franchiseHistory={franchiseHistory}
    />
  )
}

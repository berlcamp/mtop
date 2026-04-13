import { notFound } from "next/navigation"
import { getApplication } from "@/lib/actions/applications"
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

  return <ApplicationDetail application={data} settings={settings} />
}

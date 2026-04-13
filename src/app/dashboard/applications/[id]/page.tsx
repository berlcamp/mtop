import { notFound } from "next/navigation"
import { getApplication } from "@/lib/actions/applications"
import { ApplicationDetail } from "./application-detail"

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data, error } = await getApplication(id)

  if (error || !data) {
    notFound()
  }

  return <ApplicationDetail application={data} />
}

import { notFound } from "next/navigation"
import { getConfirmationSlipData } from "@/lib/actions/confirmation-slip"
import { ConfirmationSlip } from "@/components/mtop/confirmation-slip"
import { PrintControls } from "../../print-controls"

export default async function PrintConfirmationSlipPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data, error } = await getConfirmationSlipData(id)

  if (!data) {
    if (error) {
      return (
        <main className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-lg font-semibold">
            Confirmation Slip unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </main>
      )
    }
    notFound()
  }

  return (
    <main className="print-card-page">
      <PrintControls
        title="Confirmation Slip"
        subject={data.mtopNumber}
        hint="Print on 8.5 × 13 in (long bond) at 100% scale, background graphics on."
      />
      <div className="card-stage">
        <ConfirmationSlip data={data} />
      </div>
    </main>
  )
}

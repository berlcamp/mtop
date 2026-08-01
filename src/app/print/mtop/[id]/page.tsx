import { notFound } from "next/navigation"
import { Oswald, Playfair_Display, Poppins } from "next/font/google"
import { getFranchiseCardData } from "@/lib/actions/card"
import { FranchiseCard } from "@/components/mtop/franchise-card"
import { PrintControls } from "./print-controls"

// The permit's own typography, independent of the app's Plus Jakarta Sans.
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--card-oswald",
})
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--card-playfair",
})
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--card-poppins",
})

export default async function PrintMtopCardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data, error } = await getFranchiseCardData(id)

  if (!data) {
    if (error) {
      return (
        <main className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-lg font-semibold">Franchise Card unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </main>
      )
    }
    notFound()
  }

  return (
    <main
      className={`${oswald.variable} ${playfair.variable} ${poppins.variable} print-card-page`}
    >
      <PrintControls mtopNumber={data.mtopNumber} />
      <div className="card-stage">
        <FranchiseCard data={data} />
      </div>
    </main>
  )
}

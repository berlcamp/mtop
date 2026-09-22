"use server"

import { createClient } from "@/lib/supabase/server"
import { getSystemSettings } from "@/lib/actions/settings"
import { displayAddress } from "@/lib/address"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export interface FranchiseCardData {
  variant: "NEW" | "RENEWAL"
  year: string
  mtopNumber: string
  cabNumber: string
  validFrom: string
  validTo: string
  ownerName: string
  ownerAddress: string
  route: string
  dayOff: string
  make: string
  motorNumber: string
  chassisNumber: string
  plateNumber: string
  driverName: string
  driverAddress: string
  ownerPhotoUrl: string | null
  driverPhotoUrl: string | null
  ctmsContactNumber: string
  orNumber: string
  amountPaid: string
  datePaid: string
}

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
]

/**
 * The permit runs on calendar years: granted in 2026 with 3-year validity
 * prints as 01 JANUARY 2026 – 31 DECEMBER 2028. This is presentation only —
 * mtop_franchises.granted_until still drives renewal reminders.
 */
function calendarValidity(grantedAt: string | null, validityYears: number) {
  if (!grantedAt) return { from: "", to: "", year: "" }
  const startYear = new Date(grantedAt).getFullYear()
  const endYear = startYear + Math.max(1, validityYears) - 1
  return {
    from: `01 JANUARY ${startYear}`,
    to: `31 DECEMBER ${endYear}`,
    year: String(startYear),
  }
}

function formatDatePaid(value: string | null) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return `${MONTHS[d.getMonth()][0]}${MONTHS[d.getMonth()]
    .slice(1)
    .toLowerCase()} ${d.getDate()}, ${d.getFullYear()}`
}

function formatPeso(amount: number) {
  return `Php ${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export async function getFranchiseCardData(applicationId: string): Promise<{
  error: string | null
  data: FranchiseCardData | null
}> {
  try {
    const { supabase } = await getAuthUser()

    const { data: application, error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("*, franchise:mtop_franchises(*)")
      .eq("id", applicationId)
      .single()

    if (error || !application) {
      return { error: error?.message ?? "Application not found.", data: null }
    }

    if (application.status !== "granted") {
      return {
        error: "The Franchise Card is only available once the MTOP is granted.",
        data: null,
      }
    }

    const franchise = application.franchise
    if (!franchise) return { error: "Franchise not found.", data: null }

    const [{ data: payments }, { data: settings }, { count: priorGrants }] =
      await Promise.all([
        supabase
          .schema("mtop")
          .from("mtop_payments")
          .select("or_number, amount_paid, payment_date")
          .eq("application_id", applicationId)
          .order("payment_date", { ascending: true }),
        getSystemSettings(),
        // Any earlier granted cycle for this franchise makes this a renewal.
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("id", { count: "exact", head: true })
          .eq("franchise_id", franchise.id)
          .eq("status", "granted")
          .lt("granted_at", application.granted_at ?? new Date().toISOString()),
      ])

    const paid = payments ?? []
    const total = paid.reduce(
      (sum: number, p: { amount_paid: number }) => sum + Number(p.amount_paid),
      0
    )

    const validity = calendarValidity(
      application.granted_at,
      settings.permit_validity_years
    )

    return {
      error: null,
      data: {
        variant: (priorGrants ?? 0) > 0 ? "RENEWAL" : "NEW",
        year: validity.year,
        mtopNumber: franchise.mtop_number ?? "",
        cabNumber: franchise.tricycle_body_number ?? "",
        validFrom: validity.from,
        validTo: validity.to,
        ownerName: franchise.applicant_name ?? "",
        // Without the city: the permit's letterhead already says Ozamiz, and
        // the address line is the narrowest field on the card. Franchises
        // registered before the address was structured fall back to their
        // free-text line — see src/lib/address.ts.
        ownerAddress: displayAddress(franchise, { includeCity: false }),
        route: franchise.route ?? "",
        dayOff: franchise.day_off ?? "",
        make: franchise.make ?? "",
        motorNumber: franchise.motor_number ?? "",
        chassisNumber: franchise.chassis_number ?? "",
        plateNumber: franchise.plate_number ?? "",
        driverName: franchise.driver_name ?? "",
        driverAddress: franchise.driver_address ?? "",
        ownerPhotoUrl: franchise.owner_photo_url ?? null,
        driverPhotoUrl: franchise.driver_photo_url ?? null,
        ctmsContactNumber: settings.ctms_contact_number,
        orNumber: paid.map((p) => p.or_number).join(", "),
        amountPaid: paid.length > 0 ? formatPeso(total) : "",
        datePaid: formatDatePaid(paid[0]?.payment_date ?? null),
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

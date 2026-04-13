"use server"

import { createClient } from "@/lib/supabase/server"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export async function getApplicationsByStatus(fiscalYear?: number) {
  try {
    const { supabase } = await getAuthUser()
    const year = fiscalYear ?? new Date().getFullYear()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("status")
      .eq("fiscal_year", year)

    if (error) return { error: error.message, data: null }

    // Count by status
    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      counts[row.status] = (counts[row.status] || 0) + 1
    }

    return { error: null, data: counts }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getRevenueSummary(fiscalYear?: number) {
  try {
    const { supabase } = await getAuthUser()
    const year = fiscalYear ?? new Date().getFullYear()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_assessments")
      .select(
        `filing_fee, supervision_fee, confirmation_fee, mayors_permit_fee,
         franchise_fee, police_clearance_fee, health_fee, legal_research_fee,
         parking_fee, late_renewal_penalty, change_of_motor_fee,
         replacement_plate_fee, total_amount,
         application:mtop_applications!application_id(fiscal_year)`
      )
      .not("approved_at", "is", null)

    if (error) return { error: error.message, data: null }

    // Filter by fiscal year and sum
    const filtered = (data ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.application?.fiscal_year === year
    )

    const feeKeys = [
      "filing_fee",
      "supervision_fee",
      "confirmation_fee",
      "mayors_permit_fee",
      "franchise_fee",
      "police_clearance_fee",
      "health_fee",
      "legal_research_fee",
      "parking_fee",
      "late_renewal_penalty",
      "change_of_motor_fee",
      "replacement_plate_fee",
    ]

    const summary: Record<string, number> = {}
    let grandTotal = 0

    for (const key of feeKeys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sum = filtered.reduce((s: number, row: any) => s + Number(row[key] ?? 0), 0)
      summary[key] = sum
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    grandTotal = filtered.reduce((s: number, row: any) => s + Number(row.total_amount ?? 0), 0)
    summary.total = grandTotal

    return { error: null, data: summary }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getMonthlyTrends(fiscalYear?: number) {
  try {
    const { supabase } = await getAuthUser()
    const year = fiscalYear ?? new Date().getFullYear()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("submitted_at, status")
      .eq("fiscal_year", year)

    if (error) return { error: error.message, data: null }

    // Group by month
    const monthly: Record<number, { total: number; granted: number }> = {}
    for (let m = 1; m <= 12; m++) {
      monthly[m] = { total: 0, granted: 0 }
    }

    for (const row of data ?? []) {
      const month = new Date(row.submitted_at).getMonth() + 1
      monthly[month].total++
      if (row.status === "granted") {
        monthly[month].granted++
      }
    }

    return { error: null, data: monthly }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getLateRenewalStats(fiscalYear?: number) {
  try {
    const { supabase } = await getAuthUser()
    const year = fiscalYear ?? new Date().getFullYear()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_assessments")
      .select(
        "late_renewal_penalty, application:mtop_applications!application_id(fiscal_year)"
      )

    if (error) return { error: error.message, data: null }

    const filtered = (data ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.application?.fiscal_year === year
    )

    const totalAssessments = filtered.length
    const withPenalty = filtered.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => Number(a.late_renewal_penalty) > 0
    )
    const totalPenalties = withPenalty.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: number, a: any) => s + Number(a.late_renewal_penalty),
      0
    )

    return {
      error: null,
      data: {
        totalAssessments,
        lateCount: withPenalty.length,
        latePercentage:
          totalAssessments > 0
            ? Math.round((withPenalty.length / totalAssessments) * 100)
            : 0,
        totalPenalties,
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getApplicationsForExport(fiscalYear?: number) {
  try {
    const { supabase } = await getAuthUser()
    const year = fiscalYear ?? new Date().getFullYear()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select(
        `application_number, applicant_name, applicant_address, contact_number,
         tricycle_body_number, plate_number, motor_number, chassis_number,
         route, status, fiscal_year, due_date, submitted_at, granted_at`
      )
      .eq("fiscal_year", year)
      .order("application_number")

    if (error) return { error: error.message, data: null }
    return { error: null, data }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

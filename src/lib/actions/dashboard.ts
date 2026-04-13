"use server"

import { createClient } from "@/lib/supabase/server"
import type { MtopStatus } from "@/types/database"
import { getSystemSettings } from "@/lib/actions/settings"
import { getPermitExpirationInfo } from "@/lib/utils/permit-expiration"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

const PIPELINE_STATUSES: MtopStatus[] = [
  "for_verification",
  "for_inspection",
  "for_assessment",
  "for_approval",
  "granted",
]

export async function getDashboardStats() {
  try {
    const { supabase } = await getAuthUser()
    const currentYear = new Date().getFullYear()

    // Fetch all counts in parallel
    const [totalResult, pendingResult, grantedResult, revenueResult] =
      await Promise.all([
        // Total applications this year
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("*", { count: "exact", head: true })
          .eq("fiscal_year", currentYear),

        // Pending (all non-terminal statuses)
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("*", { count: "exact", head: true })
          .eq("fiscal_year", currentYear)
          .in("status", [
            "for_verification",
            "for_inspection",
            "for_assessment",
            "for_approval",
          ]),

        // Granted this year
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("*", { count: "exact", head: true })
          .eq("fiscal_year", currentYear)
          .eq("status", "granted"),

        // Total revenue (sum of payments)
        supabase
          .schema("mtop")
          .from("mtop_payments")
          .select("amount_paid"),
      ])

    const revenue = (revenueResult.data ?? []).reduce(
      (sum: number, p: { amount_paid: number }) => sum + Number(p.amount_paid),
      0
    )

    return {
      error: null,
      data: {
        totalApplications: totalResult.count ?? 0,
        pending: pendingResult.count ?? 0,
        granted: grantedResult.count ?? 0,
        revenue,
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getPipelineCounts() {
  try {
    const { supabase } = await getAuthUser()
    const currentYear = new Date().getFullYear()

    const results = await Promise.all(
      PIPELINE_STATUSES.map((status) =>
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("*", { count: "exact", head: true })
          .eq("fiscal_year", currentYear)
          .eq("status", status)
      )
    )

    const pipeline = PIPELINE_STATUSES.map((status, i) => ({
      status,
      count: results[i].count ?? 0,
    }))

    return { error: null, data: pipeline }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getRecentActivity(limit = 10) {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("approval_logs")
      .select(
        "*, actor:user_profiles!actor_id(id, full_name), application:mtop_applications!application_id(application_number, applicant_name)"
      )
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) return { error: error.message, data: null }
    return { error: null, data }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getRenewalStats() {
  try {
    const { supabase } = await getAuthUser()
    const { data: settings } = await getSystemSettings()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("granted_at")
      .eq("status", "granted")
      .not("granted_at", "is", null)

    if (error) return { error: error.message, data: null }

    let expired = 0
    let dueForRenewal = 0
    let active = 0

    for (const app of data ?? []) {
      const info = getPermitExpirationInfo(
        app.granted_at,
        settings.permit_validity_years,
        settings.renewal_window_days
      )
      if (info.status === "expired") expired++
      else if (info.status === "due_for_renewal") dueForRenewal++
      else active++
    }

    return { error: null, data: { expired, dueForRenewal, active } }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ApplicationFormValues } from "@/lib/schemas/mtop"
import type { MtopStatus } from "@/types/database"

const DOCUMENT_TYPES = [
  "application_form",
  "ctms_clearance",
  "lto_or",
  "voters_certificate",
  "barangay_certification",
  "barangay_endorsement",
  "ctc",
  "police_clearance",
  "drivers_license",
  "affidavit_no_franchise",
] as const

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

function generateApplicationNumber(fiscalYear: number, sequence: number): string {
  return `MTOP-${fiscalYear}-${String(sequence).padStart(5, "0")}`
}

export async function createApplication(input: ApplicationFormValues) {
  try {
    const { supabase, user } = await getAuthUser()

    // Get next application number
    const fiscalYear = new Date().getFullYear()
    const { count } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("*", { count: "exact", head: true })
      .eq("fiscal_year", fiscalYear)

    const applicationNumber = generateApplicationNumber(
      fiscalYear,
      (count ?? 0) + 1
    )

    // Insert application
    const { data: application, error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .insert({
        application_number: applicationNumber,
        applicant_name: input.applicant_name,
        applicant_address: input.applicant_address,
        contact_number: input.contact_number,
        tricycle_body_number: input.tricycle_body_number,
        plate_number: input.plate_number,
        motor_number: input.motor_number,
        chassis_number: input.chassis_number,
        route: input.route,
        due_date: input.due_date || null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) return { error: error.message, data: null }

    // Create empty document records for all 10 types
    const documentRecords = DOCUMENT_TYPES.map((docType) => ({
      application_id: application.id,
      document_type: docType,
    }))

    const { error: docError } = await supabase
      .schema("mtop")
      .from("mtop_documents")
      .insert(documentRecords)

    if (docError) return { error: docError.message, data: null }

    // Create initial approval log
    await supabase
      .schema("mtop")
      .from("approval_logs")
      .insert({
        application_id: application.id,
        stage: "for_verification" as MtopStatus,
        action: "forwarded",
        actor_id: user.id,
        remarks: "Application submitted",
      })

    revalidatePath("/dashboard/applications")
    return { error: null, data: application }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export interface ApplicationFilters {
  status?: MtopStatus
  search?: string
  page?: number
  pageSize?: number
}

export async function getApplications(filters: ApplicationFilters = {}) {
  try {
    const { supabase } = await getAuthUser()
    const { status, search, page = 1, pageSize = 20 } = filters

    let query = supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })

    if (status) {
      query = query.eq("status", status)
    }

    if (search) {
      query = query.or(
        `applicant_name.ilike.%${search}%,application_number.ilike.%${search}%`
      )
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) return { error: error.message, data: null, count: 0 }
    return { error: null, data, count: count ?? 0 }
  } catch (e) {
    return { error: (e as Error).message, data: null, count: 0 }
  }
}

export async function getApplication(id: string) {
  try {
    const { supabase } = await getAuthUser()

    const [appResult, docsResult, inspResult, assessResult, payResult, logsResult] =
      await Promise.all([
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("*, creator:user_profiles!created_by(id, full_name, email)")
          .eq("id", id)
          .single(),
        supabase
          .schema("mtop")
          .from("mtop_documents")
          .select("*")
          .eq("application_id", id)
          .order("document_type"),
        supabase
          .schema("mtop")
          .from("mtop_inspections")
          .select("*, inspector:user_profiles!inspector_id(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .schema("mtop")
          .from("mtop_assessments")
          .select("*, assessor:user_profiles!assessed_by(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .schema("mtop")
          .from("mtop_payments")
          .select("*, receiver:user_profiles!received_by(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .schema("mtop")
          .from("approval_logs")
          .select("*, actor:user_profiles!actor_id(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false }),
      ])

    if (appResult.error) return { error: appResult.error.message, data: null }

    return {
      error: null,
      data: {
        ...appResult.data,
        documents: docsResult.data ?? [],
        inspection: inspResult.data ?? null,
        assessment: assessResult.data ?? null,
        payments: payResult.data ?? [],
        approval_logs: logsResult.data ?? [],
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function updateApplicationStatus(
  id: string,
  status: MtopStatus,
  action: "approved" | "rejected" | "returned" | "forwarded",
  remarks?: string
) {
  try {
    const { supabase, user } = await getAuthUser()

    const updateData: Record<string, unknown> = { status }
    if (status === "granted") {
      updateData.granted_at = new Date().toISOString()
    }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .update(updateData)
      .eq("id", id)

    if (error) return { error: error.message }

    // Create approval log entry
    const { error: logError } = await supabase
      .schema("mtop")
      .from("approval_logs")
      .insert({
        application_id: id,
        stage: status,
        action,
        actor_id: user.id,
        remarks: remarks || null,
      })

    if (logError) return { error: logError.message }

    revalidatePath("/dashboard/applications")
    revalidatePath(`/dashboard/applications/${id}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

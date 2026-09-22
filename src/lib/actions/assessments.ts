"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { AssessmentFormValues } from "@/lib/schemas/mtop"
import { feeKeysFor } from "@/lib/fees"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export async function createAssessment(
  applicationId: string,
  fees: AssessmentFormValues
) {
  try {
    const { supabase, user } = await getAuthUser()

    // What a transaction may be charged is not the form's decision. A closure
    // owes the certification fee and the payment for closure and nothing else;
    // every other transaction owes the annual schedule and never those two.
    // Anything outside the applicable set is zeroed here rather than trusted.
    const { data: application, error: applicationError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("id, transaction_type:transaction_types(code)")
      .eq("id", applicationId)
      .single()

    if (applicationError) {
      return { error: applicationError.message, data: null }
    }

    const transactionType = application.transaction_type as
      | { code: string }
      | { code: string }[]
      | null
    const transactionCode = Array.isArray(transactionType)
      ? transactionType[0]?.code
      : transactionType?.code

    const applicable = new Set(feeKeysFor(transactionCode))
    const charged = Object.fromEntries(
      Object.entries(fees).map(([key, value]) => [
        key,
        applicable.has(key) ? Number(value) || 0 : 0,
      ])
    ) as Record<keyof AssessmentFormValues, number>

    const totalAmount = Object.values(charged).reduce(
      (sum, amount) => sum + amount,
      0
    )

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_assessments")
      .insert({
        application_id: applicationId,
        assessed_by: user.id,
        filing_fee: charged.filing_fee,
        supervision_fee: charged.supervision_fee,
        confirmation_fee: charged.confirmation_fee,
        mayors_permit_fee: charged.mayors_permit_fee,
        franchise_fee: charged.franchise_fee,
        police_clearance_fee: charged.police_clearance_fee,
        health_fee: charged.health_fee,
        legal_research_fee: charged.legal_research_fee,
        parking_fee: charged.parking_fee,
        late_renewal_penalty: charged.late_renewal_penalty,
        change_of_motor_fee: charged.change_of_motor_fee,
        replacement_plate_fee: charged.replacement_plate_fee,
        certification_fee: charged.certification_fee,
        closure_fee: charged.closure_fee,
        total_amount: totalAmount,
      })
      .select("id")
      .single()

    if (error) return { error: error.message, data: null }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null, data }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function approveAssessment(
  assessmentId: string,
  applicationId: string
) {
  try {
    const { supabase, user } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_assessments")
      .update({
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", assessmentId)

    if (error) return { error: error.message }

    // Log approval
    await supabase
      .schema("mtop")
      .from("approval_logs")
      .insert({
        application_id: applicationId,
        stage: "for_assessment",
        action: "approved",
        actor_id: user.id,
        remarks: "Assessment approved by CTO Head",
      })

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { AssessmentFormValues } from "@/lib/schemas/mtop"

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

    const totalAmount =
      fees.filing_fee +
      fees.supervision_fee +
      fees.confirmation_fee +
      fees.mayors_permit_fee +
      fees.franchise_fee +
      fees.police_clearance_fee +
      fees.health_fee +
      fees.legal_research_fee +
      fees.parking_fee +
      fees.late_renewal_penalty +
      fees.change_of_motor_fee +
      fees.replacement_plate_fee

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_assessments")
      .insert({
        application_id: applicationId,
        assessed_by: user.id,
        filing_fee: fees.filing_fee,
        supervision_fee: fees.supervision_fee,
        confirmation_fee: fees.confirmation_fee,
        mayors_permit_fee: fees.mayors_permit_fee,
        franchise_fee: fees.franchise_fee,
        police_clearance_fee: fees.police_clearance_fee,
        health_fee: fees.health_fee,
        legal_research_fee: fees.legal_research_fee,
        parking_fee: fees.parking_fee,
        late_renewal_penalty: fees.late_renewal_penalty,
        change_of_motor_fee: fees.change_of_motor_fee,
        replacement_plate_fee: fees.replacement_plate_fee,
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

"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { PaymentFormValues } from "@/lib/schemas/mtop"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export async function recordPayment(
  applicationId: string,
  assessmentId: string,
  payment: PaymentFormValues
) {
  try {
    const { supabase, user } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_payments")
      .insert({
        application_id: applicationId,
        assessment_id: assessmentId,
        or_number: payment.or_number,
        amount_paid: payment.amount_paid,
        payment_date: payment.payment_date || new Date().toISOString().split("T")[0],
        payment_method: payment.payment_method,
        received_by: user.id,
      })

    if (error) return { error: error.message }

    // Transition to for_approval
    const { error: statusError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .update({ status: "for_approval" })
      .eq("id", applicationId)

    if (statusError) return { error: statusError.message }

    // Log the transition
    await supabase
      .schema("mtop")
      .from("approval_logs")
      .insert({
        application_id: applicationId,
        stage: "for_approval",
        action: "forwarded",
        actor_id: user.id,
        remarks: `Payment recorded — OR #${payment.or_number}`,
      })

    revalidatePath(`/dashboard/applications/${applicationId}`)
    revalidatePath("/dashboard/applications")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

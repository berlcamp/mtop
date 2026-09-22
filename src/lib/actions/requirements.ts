"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export async function verifyRequirement(
  requirementRowId: string,
  applicationId: string,
  verified: boolean
) {
  try {
    const { supabase, user } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_application_requirements")
      .update({
        is_verified: verified,
        verified_by: verified ? user.id : null,
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq("id", requirementRowId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateRequirementRemarks(
  requirementRowId: string,
  applicationId: string,
  remarks: string
) {
  try {
    const { supabase } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_application_requirements")
      .update({ remarks: remarks || null })
      .eq("id", requirementRowId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateRequirementFileUrl(
  requirementRowId: string,
  applicationId: string,
  fileUrl: string | null
) {
  try {
    const { supabase } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_application_requirements")
      .update({ file_url: fileUrl })
      .eq("id", requirementRowId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function checkNegativeList(applicantName: string) {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_negative_list")
      .select("id, applicant_name, reason")
      .eq("is_active", true)
      .ilike("applicant_name", `%${applicantName}%`)

    if (error) return { error: error.message, data: null }
    return { error: null, data: data ?? [] }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

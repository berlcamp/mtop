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

/**
 * One row's worth of changes made in the requirement checklist dialog. Only
 * the fields the clerk actually touched are present, so an untouched remark is
 * never rewritten and an untouched tick never restamps `verified_at`.
 */
export type RequirementReviewChange = {
  id: string
  is_verified?: boolean
  remarks?: string | null
}

/**
 * Commits a whole checklist review in one call.
 *
 * The dialog holds ticks and remarks locally until Save, so clearing a
 * fourteen-item checklist is one request and one RSC refresh rather than
 * fourteen of each — the old per-row writes made a full pass through the
 * checklist visibly stutter as each refresh landed.
 *
 * Ticks collapse into at most two statements (`.in(...)` over the cleared ids
 * and over the uncleared ones); only rows whose remark actually changed are
 * written individually. Every statement is also keyed on `application_id`, so
 * a forged id from another application updates nothing.
 */
export async function saveRequirementReview(
  applicationId: string,
  changes: RequirementReviewChange[]
) {
  try {
    const { supabase, user } = await getAuthUser()

    const cleared = changes.filter((c) => c.is_verified === true).map((c) => c.id)
    const uncleared = changes
      .filter((c) => c.is_verified === false)
      .map((c) => c.id)
    const remarked = changes.filter((c) => c.remarks !== undefined)

    if (cleared.length > 0) {
      const { error } = await supabase
        .schema("mtop")
        .from("mtop_application_requirements")
        .update({
          is_verified: true,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        })
        .eq("application_id", applicationId)
        .in("id", cleared)

      if (error) return { error: error.message }
    }

    if (uncleared.length > 0) {
      const { error } = await supabase
        .schema("mtop")
        .from("mtop_application_requirements")
        .update({ is_verified: false, verified_by: null, verified_at: null })
        .eq("application_id", applicationId)
        .in("id", uncleared)

      if (error) return { error: error.message }
    }

    for (const change of remarked) {
      const { error } = await supabase
        .schema("mtop")
        .from("mtop_application_requirements")
        .update({ remarks: change.remarks || null })
        .eq("application_id", applicationId)
        .eq("id", change.id)

      if (error) return { error: error.message }
    }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/**
 * Points the application at its bundled requirements PDF, or clears it.
 *
 * The file itself is uploaded from the browser straight to storage, as the
 * per-row attachments are; this only records where it landed. Passing null
 * clears every column together, so a cleared bundle never leaves a stale
 * filename or uploader behind for the next clerk to read.
 */
export async function updateRequirementsBundle(
  applicationId: string,
  file: { url: string; name: string; size: number } | null
) {
  try {
    const { supabase, user } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .update(
        file
          ? {
              requirements_file_url: file.url,
              requirements_file_name: file.name,
              requirements_file_size: file.size,
              requirements_uploaded_at: new Date().toISOString(),
              requirements_uploaded_by: user.id,
            }
          : {
              requirements_file_url: null,
              requirements_file_name: null,
              requirements_file_size: null,
              requirements_uploaded_at: null,
              requirements_uploaded_by: null,
            }
      )
      .eq("id", applicationId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

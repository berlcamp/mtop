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

export async function verifyDocument(
  documentId: string,
  applicationId: string,
  verified: boolean
) {
  try {
    const { supabase, user } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_documents")
      .update({
        is_verified: verified,
        verified_by: verified ? user.id : null,
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq("id", documentId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateDocumentRemarks(
  documentId: string,
  applicationId: string,
  remarks: string
) {
  try {
    const { supabase } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_documents")
      .update({ remarks: remarks || null })
      .eq("id", documentId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateDocumentFileUrl(
  documentId: string,
  applicationId: string,
  fileUrl: string | null
) {
  try {
    const { supabase } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_documents")
      .update({ file_url: fileUrl })
      .eq("id", documentId)

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

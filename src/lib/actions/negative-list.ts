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

export interface NegativeListFilters {
  search?: string
  page?: number
  pageSize?: number
}

export async function getNegativeList(filters: NegativeListFilters = {}) {
  try {
    const { supabase } = await getAuthUser()
    const { search, page = 1, pageSize = 20 } = filters

    let query = supabase
      .schema("mtop")
      .from("mtop_negative_list")
      .select("*, added_by_user:user_profiles!added_by(id, full_name)", {
        count: "exact",
      })
      .order("created_at", { ascending: false })

    if (search) {
      query = query.ilike("applicant_name", `%${search}%`)
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

export async function addToNegativeList(
  applicantName: string,
  reason: string
) {
  try {
    const { supabase, user } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_negative_list")
      .insert({
        applicant_name: applicantName,
        reason,
        added_by: user.id,
      })

    if (error) return { error: error.message }

    revalidatePath("/dashboard/negative-list")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateNegativeListEntry(
  id: string,
  data: { applicant_name?: string; reason?: string }
) {
  try {
    const { supabase } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_negative_list")
      .update(data)
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath("/dashboard/negative-list")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function toggleNegativeListEntry(
  id: string,
  isActive: boolean
) {
  try {
    const { supabase } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_negative_list")
      .update({ is_active: isActive })
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath("/dashboard/negative-list")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function bulkAddToNegativeList(
  entries: Array<{ applicant_name: string; reason: string }>
) {
  try {
    const { supabase, user } = await getAuthUser()

    const rows = entries.map((e) => ({
      applicant_name: e.applicant_name,
      reason: e.reason,
      added_by: user.id,
    }))

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_negative_list")
      .insert(rows)

    if (error) return { error: error.message, inserted: 0 }

    revalidatePath("/dashboard/negative-list")
    return { error: null, inserted: rows.length }
  } catch (e) {
    return { error: (e as Error).message, inserted: 0 }
  }
}

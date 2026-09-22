"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { Association } from "@/types/database"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export interface AssociationFilters {
  search?: string
  /** Admin listing passes true so deactivated rows stay visible/editable. */
  includeInactive?: boolean
}

export async function getAssociations(
  filters: AssociationFilters = {}
): Promise<{ error: string | null; data: Association[] }> {
  try {
    const { supabase } = await getAuthUser()
    const { search, includeInactive = false } = filters

    let query = supabase
      .schema("mtop")
      .from("associations")
      .select("*")
      .order("sort_order")
      .order("name")

    if (!includeInactive) query = query.eq("is_active", true)

    if (search?.trim()) {
      const safe = search.trim().replace(/[,()\\]/g, " ")
      query = query.or(
        `name.ilike.%${safe}%,president_name.ilike.%${safe}%`
      )
    }

    const { data, error } = await query

    if (error) return { error: error.message, data: [] }
    return { error: null, data: (data ?? []) as Association[] }
  } catch (e) {
    return { error: (e as Error).message, data: [] }
  }
}

export interface AssociationInput {
  name: string
  president_name?: string | null
  contact_number?: string | null
}

export async function createAssociation(input: AssociationInput) {
  try {
    const { supabase } = await getAuthUser()

    const name = input.name.trim()
    if (!name) return { error: "Association name is required.", data: null }

    const { data, error } = await supabase
      .schema("mtop")
      .from("associations")
      .insert({
        name,
        president_name: input.president_name?.trim() || null,
        contact_number: input.contact_number?.trim() || null,
      })
      .select("id")
      .single()

    if (error) {
      // 23505 = unique_violation on associations.name
      if (error.code === "23505") {
        return { error: `"${name}" is already on the list.`, data: null }
      }
      return { error: error.message, data: null }
    }

    revalidatePath("/dashboard/admin/associations")
    return { error: null, data }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function updateAssociation(id: string, input: AssociationInput) {
  try {
    const { supabase } = await getAuthUser()

    const name = input.name.trim()
    if (!name) return { error: "Association name is required." }

    const { error } = await supabase
      .schema("mtop")
      .from("associations")
      .update({
        name,
        president_name: input.president_name?.trim() || null,
        contact_number: input.contact_number?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) {
      if (error.code === "23505") {
        return { error: `"${name}" is already on the list.` }
      }
      return { error: error.message }
    }

    revalidatePath("/dashboard/admin/associations")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function toggleAssociation(id: string, isActive: boolean) {
  try {
    const { supabase } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("associations")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath("/dashboard/admin/associations")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/**
 * Hard delete. The franchises FK has no ON DELETE action, so Postgres refuses
 * to remove an association that motorcabs are still registered under — that
 * rejection is turned into an instruction to deactivate instead, which keeps
 * the historical link intact.
 */
export async function deleteAssociation(id: string) {
  try {
    const { supabase } = await getAuthUser()

    const { count, error: countError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select("id", { count: "exact", head: true })
      .eq("association_id", id)

    if (countError) return { error: countError.message }

    if ((count ?? 0) > 0) {
      return {
        error: `${count} franchise(s) are registered under this association, so it can't be deleted. Deactivate it instead — it will stop appearing on new applications but stay on existing records.`,
      }
    }

    const { error } = await supabase
      .schema("mtop")
      .from("associations")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath("/dashboard/admin/associations")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

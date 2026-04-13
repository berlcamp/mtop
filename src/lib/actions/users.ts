"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomUUID } from "crypto"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export async function getUsers() {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("user_profiles")
      .select(
        `*, office:offices(id, name, code),
         user_roles(id, role_id, role:roles(id, name, code))`
      )
      .order("created_at", { ascending: false })

    if (error) return { error: error.message, data: null }
    return { error: null, data }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getRolesAndOffices() {
  try {
    const { supabase } = await getAuthUser()

    const [rolesResult, officesResult] = await Promise.all([
      supabase.schema("mtop").from("roles").select("*").order("name"),
      supabase.schema("mtop").from("offices").select("*").order("name"),
    ])

    return {
      error: null,
      roles: rolesResult.data ?? [],
      offices: officesResult.data ?? [],
    }
  } catch (e) {
    return { error: (e as Error).message, roles: [], offices: [] }
  }
}

export async function addUser(input: {
  email: string
  full_name: string
  office_id: string | null
  role_ids: string[]
}) {
  try {
    await getAuthUser()
    const adminSupabase = createAdminClient()

    // Check if email already exists
    const { data: existing } = await adminSupabase
      .from("user_profiles")
      .select("id")
      .eq("email", input.email)
      .maybeSingle()

    if (existing) {
      return { error: "A user with this email already exists." }
    }

    // Create a placeholder profile with a temporary UUID.
    // When the user first logs in via Google OAuth, the auth callback
    // will detect the email match and replace this with their real auth.users ID.
    const placeholderId = randomUUID()

    const { error: profileError } = await adminSupabase
      .from("user_profiles")
      .insert({
        id: placeholderId,
        email: input.email,
        full_name: input.full_name,
        office_id: input.office_id || null,
      })

    if (profileError) return { error: profileError.message }

    // Assign roles
    if (input.role_ids.length > 0) {
      const { error: roleError } = await adminSupabase
        .from("user_roles")
        .insert(
          input.role_ids.map((roleId) => ({
            user_id: placeholderId,
            role_id: roleId,
          }))
        )

      if (roleError) return { error: roleError.message }
    }

    revalidatePath("/dashboard/admin/users")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateUser(
  userId: string,
  input: {
    full_name: string
    office_id: string | null
    role_ids: string[]
  }
) {
  try {
    await getAuthUser()
    const adminSupabase = createAdminClient()

    // Update profile
    const { error: profileError } = await adminSupabase
      .from("user_profiles")
      .update({
        full_name: input.full_name,
        office_id: input.office_id || null,
      })
      .eq("id", userId)

    if (profileError) return { error: profileError.message }

    // Replace roles: delete existing, insert new
    await adminSupabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)

    if (input.role_ids.length > 0) {
      const { error: roleError } = await adminSupabase
        .from("user_roles")
        .insert(
          input.role_ids.map((roleId) => ({
            user_id: userId,
            role_id: roleId,
          }))
        )

      if (roleError) return { error: roleError.message }
    }

    revalidatePath("/dashboard/admin/users")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function deleteUser(userId: string) {
  try {
    await getAuthUser()
    const adminSupabase = createAdminClient()

    // Delete roles first
    await adminSupabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)

    // Delete profile
    const { error } = await adminSupabase
      .from("user_profiles")
      .delete()
      .eq("id", userId)

    if (error) return { error: error.message }

    revalidatePath("/dashboard/admin/users")
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

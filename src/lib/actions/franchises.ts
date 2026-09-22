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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function hasPermission(
  supabase: SupabaseServerClient,
  userId: string,
  code: string
) {
  const { data: userRoles } = await supabase
    .schema("mtop")
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)

  if (!userRoles || userRoles.length === 0) return false

  const { data: rolePerms } = await supabase
    .schema("mtop")
    .from("role_permissions")
    .select("permission:permissions(code)")
    .in(
      "role_id",
      userRoles.map((ur: { role_id: string }) => ur.role_id)
    )

  return (rolePerms ?? []).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rp: any) => (rp.permission as { code: string } | null)?.code === code
  )
}

/**
 * The client-side gate is UX only — re-check here that the caller may edit the
 * franchise's photos/driver details and that the permit isn't already issued.
 */
async function assertCanEditFranchise(
  supabase: SupabaseServerClient,
  userId: string,
  applicationId: string,
  franchiseId: string
) {
  if (!(await hasPermission(supabase, userId, "application.verify"))) {
    return "You do not have permission to edit franchise photos."
  }

  const { data: application, error } = await supabase
    .schema("mtop")
    .from("mtop_applications")
    .select("id, status, franchise_id")
    .eq("id", applicationId)
    .single()

  if (error || !application) return "Application not found."
  if (application.franchise_id !== franchiseId) {
    return "This franchise does not belong to the application."
  }
  if (application.status === "granted") {
    return "This permit has already been granted and can no longer be edited."
  }

  return null
}

export async function updateFranchisePhoto(
  franchiseId: string,
  applicationId: string,
  slot: "owner" | "driver",
  url: string | null
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertCanEditFranchise(
      supabase,
      user.id,
      applicationId,
      franchiseId
    )
    if (denied) return { error: denied }

    const column = slot === "owner" ? "owner_photo_url" : "driver_photo_url"

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .update({ [column]: url })
      .eq("id", franchiseId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateFranchiseDriverDetails(
  franchiseId: string,
  applicationId: string,
  details: {
    driver_name: string | null
    driver_license_number: string | null
    driver_address: string | null
    make: string | null
    day_off: string | null
  }
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertCanEditFranchise(
      supabase,
      user.id,
      applicationId,
      franchiseId
    )
    if (denied) return { error: denied }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .update({
        driver_name: details.driver_name?.trim() || null,
        driver_license_number: details.driver_license_number?.trim() || null,
        driver_address: details.driver_address?.trim() || null,
        make: details.make?.trim() || null,
        day_off: details.day_off?.trim() || null,
      })
      .eq("id", franchiseId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/**
 * One franchise with everything the franchise record page shows: the
 * association it belongs to, who registered it, and every transaction ever
 * filed against it, newest first.
 *
 * The franchise — not the application — is the operator's permanent record,
 * so this is the query behind /dashboard/franchises/[id]. Its audit trail is
 * fetched separately by getFranchiseHistory() in @/lib/actions/audit.
 */
export async function getFranchise(id: string) {
  try {
    const { supabase } = await getAuthUser()

    const [franchiseResult, applicationsResult] = await Promise.all([
      supabase
        .schema("mtop")
        .from("mtop_franchises")
        .select(
          "*, association:associations(id, name), creator:user_profiles!created_by(id, full_name)"
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .schema("mtop")
        .from("mtop_applications")
        .select("*, transaction_type:transaction_types(id, code, name)")
        .eq("franchise_id", id)
        .order("submitted_at", { ascending: false }),
    ])

    if (franchiseResult.error) {
      return { error: franchiseResult.error.message, data: null }
    }
    if (!franchiseResult.data) {
      return { error: "Franchise not found.", data: null }
    }
    if (applicationsResult.error) {
      return { error: applicationsResult.error.message, data: null }
    }

    return {
      error: null,
      data: {
        franchise: franchiseResult.data,
        applications: applicationsResult.data ?? [],
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

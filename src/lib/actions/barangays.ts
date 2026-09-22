"use server"

import { createClient } from "@/lib/supabase/server"
import type { Barangay } from "@/types/database"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

/**
 * The city's barangays, for the address picker.
 *
 * Reference data seeded in 20260413000020 and read-only to the application —
 * there is no write policy on mtop.barangays, since the list changes only by
 * plebiscite. Correcting a spelling is an UPDATE run by an administrator, and
 * the foreign key carries it through to every franchise using that name.
 */
export async function getBarangays(): Promise<{
  error: string | null
  data: Barangay[]
}> {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("barangays")
      .select("*")
      .eq("is_active", true)
      .order("name")

    if (error) return { error: error.message, data: [] }
    return { error: null, data: (data ?? []) as Barangay[] }
  } catch (e) {
    return { error: (e as Error).message, data: [] }
  }
}

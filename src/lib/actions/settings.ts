"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { SystemSettingsFormValues } from "@/lib/schemas/mtop"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export interface SystemSettings {
  permit_validity_years: number
  renewal_window_days: number
}

const DEFAULTS: SystemSettings = {
  permit_validity_years: 3,
  renewal_window_days: 90,
}

export async function getSystemSettings(): Promise<{
  error: string | null
  data: SystemSettings
}> {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("system_settings")
      .select("key, value")
      .in("key", ["permit_validity_years", "renewal_window_days"])

    if (error) return { error: error.message, data: DEFAULTS }

    const settings = { ...DEFAULTS }
    for (const row of data ?? []) {
      if (row.key === "permit_validity_years") {
        settings.permit_validity_years = Number(row.value) || DEFAULTS.permit_validity_years
      }
      if (row.key === "renewal_window_days") {
        settings.renewal_window_days = Number(row.value) || DEFAULTS.renewal_window_days
      }
    }

    return { error: null, data: settings }
  } catch (e) {
    return { error: (e as Error).message, data: DEFAULTS }
  }
}

export async function updateSystemSettings(input: SystemSettingsFormValues) {
  try {
    const { supabase, user } = await getAuthUser()

    const updates = [
      {
        key: "permit_validity_years",
        value: input.permit_validity_years,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      {
        key: "renewal_window_days",
        value: input.renewal_window_days,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
    ]

    for (const row of updates) {
      const { error } = await supabase
        .schema("mtop")
        .from("system_settings")
        .upsert(row, { onConflict: "key" })

      if (error) return { error: error.message }
    }

    revalidatePath("/dashboard")
    revalidatePath("/dashboard/applications")
    revalidatePath("/dashboard/admin/settings")

    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

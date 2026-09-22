"use server"

import { createClient } from "@/lib/supabase/server"
import type {
  RequirementKind,
  TransactionType,
  TransactionTypeCode,
} from "@/types/database"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export async function getTransactionTypes(): Promise<{
  error: string | null
  data: TransactionType[]
}> {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("transaction_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")

    if (error) return { error: error.message, data: [] }
    return { error: null, data: (data ?? []) as TransactionType[] }
  } catch (e) {
    return { error: (e as Error).message, data: [] }
  }
}

export async function getTransactionTypeByCode(code: TransactionTypeCode) {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("transaction_types")
      .select("*")
      .eq("code", code)
      .single()

    if (error) return { error: error.message, data: null }
    return { error: null, data: data as TransactionType }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export interface RequirementPreview {
  code: string
  label: string
  kind: RequirementKind
  description: string
  is_mandatory: boolean
  is_conditional: boolean
  note: string | null
  sort_order: number
}

/**
 * The checklist a transaction will ask for, in display order. Used by the
 * new-application page to show staff exactly what to collect *before* they
 * commit to filing, so nobody starts a transaction they can't finish.
 */
export async function getTransactionRequirements(
  transactionTypeId: string
): Promise<{ error: string | null; data: RequirementPreview[] }> {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("transaction_requirements")
      .select(
        "is_mandatory, is_conditional, note, sort_order, requirement:requirements(code, label, kind, description)"
      )
      .eq("transaction_type_id", transactionTypeId)
      .order("sort_order")

    if (error) return { error: error.message, data: [] }

    const rows = (data ?? []) as unknown as {
      is_mandatory: boolean
      is_conditional: boolean
      note: string | null
      sort_order: number
      requirement: {
        code: string
        label: string
        kind: RequirementKind
        description: string
      } | null
    }[]

    return {
      error: null,
      data: rows
        .filter((row) => row.requirement !== null)
        .map((row) => ({
          code: row.requirement!.code,
          label: row.requirement!.label,
          kind: row.requirement!.kind,
          description: row.requirement!.description,
          is_mandatory: row.is_mandatory,
          is_conditional: row.is_conditional,
          note: row.note,
          sort_order: row.sort_order,
        })),
    }
  } catch (e) {
    return { error: (e as Error).message, data: [] }
  }
}

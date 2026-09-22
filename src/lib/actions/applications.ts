"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSystemSettings } from "@/lib/actions/settings"
import type {
  NewFranchiseApplicationFormValues,
  FranchiseTransactionFormValues,
} from "@/lib/schemas/mtop"
import type {
  MtopStatus,
  TransactionType,
  TransactionTypeCode,
} from "@/types/database"

const ACTIVE_STATUSES: MtopStatus[] = [
  "for_verification",
  "for_inspection",
  "for_assessment",
  "for_approval",
  "returned",
]

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

type Supabase = Awaited<ReturnType<typeof getAuthUser>>["supabase"]

async function resolveTransactionType(
  supabase: Supabase,
  code: TransactionTypeCode
): Promise<{ error: string | null; data: TransactionType | null }> {
  const { data, error } = await supabase
    .schema("mtop")
    .from("transaction_types")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle()

  if (error) return { error: error.message, data: null }
  if (!data) return { error: `Unknown transaction type "${code}".`, data: null }
  return { error: null, data: data as TransactionType }
}

/**
 * Copies the transaction's checklist onto the new application. The list lives
 * in mtop.transaction_requirements, so adding or removing a requirement is a
 * data change — no migration, no code change here.
 */
async function seedApplicationChildren(
  supabase: Supabase,
  applicationId: string,
  actorId: string,
  transactionTypeId: string
) {
  const { data: matrix, error: matrixError } = await supabase
    .schema("mtop")
    .from("transaction_requirements")
    .select("requirement_id")
    .eq("transaction_type_id", transactionTypeId)

  if (matrixError) return matrixError.message
  if (!matrix || matrix.length === 0) {
    return "This transaction has no requirements configured. Ask an administrator to set up its checklist."
  }

  const { error: docError } = await supabase
    .schema("mtop")
    .from("mtop_application_requirements")
    .insert(
      matrix.map((row: { requirement_id: string }) => ({
        application_id: applicationId,
        requirement_id: row.requirement_id,
      }))
    )

  if (docError) return docError.message

  const { error: logError } = await supabase
    .schema("mtop")
    .from("approval_logs")
    .insert({
      application_id: applicationId,
      stage: "for_verification" as MtopStatus,
      action: "forwarded",
      actor_id: actorId,
      remarks: "Application submitted",
    })

  return logError?.message ?? null
}

export async function createNewFranchiseApplication(
  input: NewFranchiseApplicationFormValues
) {
  try {
    const { supabase, user } = await getAuthUser()

    const { error: typeError, data: transactionType } =
      await resolveTransactionType(supabase, "new_franchise")
    if (typeError || !transactionType)
      return { error: typeError, data: null }

    // Same motor + chassis = same vehicle = same franchise. Block duplicates.
    const { data: existing, error: existingError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select("id, mtop_number")
      .eq("motor_number", input.motor_number)
      .eq("chassis_number", input.chassis_number)
      .maybeSingle()

    if (existingError) return { error: existingError.message, data: null }
    if (existing) {
      return {
        error: `A franchise already exists for this motor + chassis${
          existing.mtop_number ? ` (${existing.mtop_number})` : ""
        }. Use the renewal flow instead.`,
        data: null,
      }
    }

    const { data: franchise, error: franchiseError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .insert({
        applicant_name: input.applicant_name,
        applicant_address: input.applicant_address,
        contact_number: input.contact_number,
        tricycle_body_number: input.tricycle_body_number,
        plate_number: input.plate_number,
        motor_number: input.motor_number,
        chassis_number: input.chassis_number,
        route: input.route,
        association_id: input.association_id,
        make: input.make?.trim() || null,
        day_off: input.day_off?.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (franchiseError) return { error: franchiseError.message, data: null }

    const { data: application, error: appError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .insert({
        franchise_id: franchise.id,
        transaction_type_id: transactionType.id,
        due_date: input.due_date || null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (appError) return { error: appError.message, data: null }

    const childError = await seedApplicationChildren(
      supabase,
      application.id,
      user.id,
      transactionType.id
    )
    if (childError) return { error: childError, data: null }

    revalidatePath("/dashboard/applications")
    return { error: null, data: application }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

/**
 * Files any of the six transactions that act on a franchise that already
 * exists — renewal, annual confirmation, change of unit, change of ownership,
 * re-issuance or closure.
 *
 * Only the renewal-window rule is transaction-specific at filing time; the
 * rules that differ on *grant* (what happens to the MTOP number, the validity
 * date, the unit or the owner) are keyed off transaction_types.grant_effect and
 * are not applied here.
 */
export async function createFranchiseTransaction(
  input: FranchiseTransactionFormValues
) {
  try {
    const { supabase, user } = await getAuthUser()
    const { data: settings } = await getSystemSettings()

    const { error: typeError, data: transactionType } =
      await resolveTransactionType(supabase, input.transaction_type_code)
    if (typeError || !transactionType) return { error: typeError, data: null }

    const { data: franchise, error: franchiseError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select("id, mtop_number, granted_until, franchise_status")
      .eq("id", input.franchise_id)
      .single()

    if (franchiseError) return { error: franchiseError.message, data: null }

    // Every one of these transactions acts on a franchise the city has already
    // granted — there is no MTOP to renew, confirm, transfer or close until then.
    if (!franchise.granted_until || !franchise.mtop_number) {
      return {
        error: `This franchise has not been granted yet — ${transactionType.name} cannot be filed until its first application is granted.`,
        data: null,
      }
    }

    if (franchise.franchise_status !== "active") {
      return {
        error: `This franchise is ${franchise.franchise_status} and cannot file new transactions.`,
        data: null,
      }
    }

    // The renewal window is a renewal rule. An annual confirmation, a change of
    // unit or a closure can be filed at any point in the franchise's life.
    if (transactionType.code === "renewal") {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const expiry = new Date(franchise.granted_until)
      const earliestRenewal = new Date(expiry)
      earliestRenewal.setDate(
        earliestRenewal.getDate() - settings.renewal_window_days
      )

      if (today < earliestRenewal) {
        return {
          error: `Too early to renew. Renewal opens on ${earliestRenewal
            .toISOString()
            .slice(0, 10)} (within ${settings.renewal_window_days} days of expiry).`,
          data: null,
        }
      }
    }

    const { data: inflight, error: inflightError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("id, status")
      .eq("franchise_id", franchise.id)
      .in("status", ACTIVE_STATUSES)
      .limit(1)

    if (inflightError) return { error: inflightError.message, data: null }
    if (inflight && inflight.length > 0) {
      return {
        error:
          "This franchise already has an in-flight application. Complete, reject or close it before filing another transaction.",
        data: null,
      }
    }

    // Plain corrections (address, contact, route, make, day off) apply right
    // away regardless of transaction — they are not what the transaction is
    // *about*. Plate number is the exception on change_unit, and applicant
    // address/contact on change_ownership: those are the subject of the
    // transaction, so they are staged as new_* below and applied only on
    // grant, alongside motor/chassis/owner name.
    const isChangeUnit = input.transaction_type_code === "change_unit"
    const isChangeOwnership = input.transaction_type_code === "change_ownership"

    const franchiseUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (!isChangeOwnership && input.applicant_address !== undefined)
      franchiseUpdates.applicant_address = input.applicant_address
    if (!isChangeOwnership && input.contact_number !== undefined)
      franchiseUpdates.contact_number = input.contact_number
    if (!isChangeUnit && input.plate_number !== undefined)
      franchiseUpdates.plate_number = input.plate_number
    if (input.tricycle_body_number !== undefined)
      franchiseUpdates.tricycle_body_number = input.tricycle_body_number
    if (input.route !== undefined) franchiseUpdates.route = input.route
    if (input.make !== undefined)
      franchiseUpdates.make = input.make?.trim() || null
    if (input.day_off !== undefined)
      franchiseUpdates.day_off = input.day_off?.trim() || null
    // Empty string means "left blank", not "clear it" — the picker submits ""
    // when nothing is chosen.
    if (input.association_id)
      franchiseUpdates.association_id = input.association_id

    const { error: updateError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .update(franchiseUpdates)
      .eq("id", franchise.id)

    if (updateError) return { error: updateError.message, data: null }

    const { data: application, error: appError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .insert({
        franchise_id: franchise.id,
        transaction_type_id: transactionType.id,
        due_date: input.due_date || null,
        created_by: user.id,
        new_motor_number: isChangeUnit ? input.new_motor_number : null,
        new_chassis_number: isChangeUnit ? input.new_chassis_number : null,
        new_plate_number: isChangeUnit ? input.new_plate_number || null : null,
        new_applicant_name: isChangeOwnership ? input.new_applicant_name : null,
        new_applicant_address: isChangeOwnership
          ? input.new_applicant_address || null
          : null,
        new_contact_number: isChangeOwnership
          ? input.new_contact_number || null
          : null,
      })
      .select("id")
      .single()

    if (appError) return { error: appError.message, data: null }

    const childError = await seedApplicationChildren(
      supabase,
      application.id,
      user.id,
      transactionType.id
    )
    if (childError) return { error: childError, data: null }

    revalidatePath("/dashboard/applications")
    return { error: null, data: application }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function searchFranchises(query: string, limit = 10) {
  try {
    const { supabase } = await getAuthUser()
    const trimmed = query.trim()
    if (!trimmed) return { error: null, data: [] }

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select(
        "*, association:associations(id, name), applications:mtop_applications(id, status, fiscal_year, granted_at)"
      )
      .or(
        `mtop_number.ilike.%${trimmed}%,applicant_name.ilike.%${trimmed}%`
      )
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) return { error: error.message, data: null }

    const results = (data ?? []).map(
      (f: {
        applications?: { status: MtopStatus }[]
      } & Record<string, unknown>) => {
        const apps = f.applications ?? []
        const hasActive = apps.some((a) => ACTIVE_STATUSES.includes(a.status))
        const { applications: _drop, ...franchise } = f
        void _drop
        return {
          ...franchise,
          has_active_application: hasActive,
        }
      }
    )

    return { error: null, data: results }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export interface ApplicationFilters {
  status?: MtopStatus
  search?: string
  page?: number
  pageSize?: number
}

export async function getApplications(filters: ApplicationFilters = {}) {
  try {
    const { supabase } = await getAuthUser()
    const { status, search, page = 1, pageSize = 20 } = filters

    let query = supabase
      .schema("mtop")
      .from("mtop_applications")
      .select(
        "*, franchise:mtop_franchises(*, association:associations(id, name)), transaction_type:transaction_types(*)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })

    if (status) {
      query = query.eq("status", status)
    }

    if (search) {
      const trimmed = search.trim()
      const { data: matches } = await supabase
        .schema("mtop")
        .from("mtop_franchises")
        .select("id")
        .or(`mtop_number.ilike.%${trimmed}%,applicant_name.ilike.%${trimmed}%`)

      const ids = (matches ?? []).map((m: { id: string }) => m.id)
      if (ids.length === 0) {
        return { error: null, data: [], count: 0 }
      }
      query = query.in("franchise_id", ids)
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

export async function getApplication(id: string) {
  try {
    const { supabase } = await getAuthUser()

    // The application row comes first: its transaction_type_id decides which
    // checklist rules to merge into the requirement rows below.
    const { data: application, error: appError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select(
        "*, franchise:mtop_franchises(*, association:associations(id, name)), transaction_type:transaction_types(*), creator:user_profiles!created_by(id, full_name, email)"
      )
      .eq("id", id)
      .single()

    if (appError) return { error: appError.message, data: null }

    const [reqResult, matrixResult, inspResult, assessResult, payResult, logsResult] =
      await Promise.all([
        supabase
          .schema("mtop")
          .from("mtop_application_requirements")
          .select(
            "*, requirement:requirements(code, label, kind, description)"
          )
          .eq("application_id", id),
        supabase
          .schema("mtop")
          .from("transaction_requirements")
          .select("requirement_id, is_mandatory, is_conditional, note, sort_order")
          .eq("transaction_type_id", application.transaction_type_id),
        supabase
          .schema("mtop")
          .from("mtop_inspections")
          .select("*, inspector:user_profiles!inspector_id(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .schema("mtop")
          .from("mtop_assessments")
          .select("*, assessor:user_profiles!assessed_by(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .schema("mtop")
          .from("mtop_payments")
          .select("*, receiver:user_profiles!received_by(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .schema("mtop")
          .from("approval_logs")
          .select("*, actor:user_profiles!actor_id(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false }),
      ])

    // Merge each application row with its catalogue entry and this
    // transaction's rules for it. A row whose requirement was later dropped
    // from the matrix still renders — it just carries no rule overrides, so it
    // is treated as mandatory, which is how it was seeded.
    const rules = new Map(
      (matrixResult.data ?? []).map(
        (r: {
          requirement_id: string
          is_mandatory: boolean
          is_conditional: boolean
          note: string | null
          sort_order: number
        }) => [r.requirement_id, r]
      )
    )

    const requirements = (reqResult.data ?? [])
      .map(
        (row: {
          requirement_id: string
          requirement: {
            code: string
            label: string
            kind: string
            description: string
          } | null
        } & Record<string, unknown>) => {
          const rule = rules.get(row.requirement_id)
          const { requirement, ...rest } = row
          return {
            ...rest,
            code: requirement?.code ?? "unknown",
            label: requirement?.label ?? "Unknown requirement",
            kind: requirement?.kind ?? "document",
            description: requirement?.description ?? "",
            is_mandatory: rule?.is_mandatory ?? true,
            is_conditional: rule?.is_conditional ?? false,
            note: rule?.note ?? null,
            sort_order: rule?.sort_order ?? 999,
          }
        }
      )
      .sort((a, b) => a.sort_order - b.sort_order)

    return {
      error: null,
      data: {
        ...application,
        requirements,
        inspection: inspResult.data ?? null,
        assessment: assessResult.data ?? null,
        payments: payResult.data ?? [],
        approval_logs: logsResult.data ?? [],
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function updateApplicationStatus(
  id: string,
  status: MtopStatus,
  action: "approved" | "rejected" | "returned" | "forwarded",
  remarks?: string
) {
  try {
    const { supabase, user } = await getAuthUser()

    const updateData: Record<string, unknown> = { status }
    let grantedAt: Date | null = null
    if (status === "granted") {
      grantedAt = new Date()
      updateData.granted_at = grantedAt.toISOString()
    }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .update(updateData)
      .eq("id", id)

    if (error) return { error: error.message }

    // grant_franchise() reads the application row itself — its
    // transaction_type's grant_effect, and any new_* values staged at filing
    // (change of unit / change of ownership) — and branches accordingly. See
    // 20260413000015_grant_effects.sql for what each of the seven effects does.
    if (status === "granted" && grantedAt) {
      const { data: settings } = await getSystemSettings()
      const { error: rpcError } = await supabase
        .schema("mtop")
        .rpc("grant_franchise", {
          p_application_id: id,
          p_granted_at: grantedAt.toISOString(),
          p_validity_years: settings.permit_validity_years,
        })
      if (rpcError) return { error: rpcError.message }
    }

    const { error: logError } = await supabase
      .schema("mtop")
      .from("approval_logs")
      .insert({
        application_id: id,
        stage: status,
        action,
        actor_id: user.id,
        remarks: remarks || null,
      })

    if (logError) return { error: logError.message }

    revalidatePath("/dashboard/applications")
    revalidatePath(`/dashboard/applications/${id}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

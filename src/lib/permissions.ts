/**
 * Server-side permission checks.
 *
 * usePermissions() answers the same question in the browser, but that is only
 * ever about what to render: a server action that trusts it is not gated at
 * all, since the action can be called directly. Actions that matter re-check
 * here, against the same mtop.user_roles → role_permissions → permissions
 * chain.
 *
 * Not a "use server" module on purpose — that would force every export to be
 * an async server action. This is a helper the actions call.
 */

import type { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export async function hasPermission(
  supabase: SupabaseServerClient,
  userId: string,
  code: string
): Promise<boolean> {
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

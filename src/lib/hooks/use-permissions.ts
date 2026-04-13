"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "./use-auth"

export function usePermissions() {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!user) {
      setPermissions([])
      setLoading(false)
      return
    }

    const fetchPermissions = async () => {
      // Get user's roles
      const { data: userRoles } = await supabase
        .schema("mtop")
        .from("user_roles")
        .select("role_id")
        .eq("user_id", user.id)

      if (!userRoles || userRoles.length === 0) {
        setPermissions([])
        setLoading(false)
        return
      }

      const roleIds = userRoles.map((ur: { role_id: string }) => ur.role_id)

      // Get permissions for those roles
      const { data: rolePerms } = await supabase
        .schema("mtop")
        .from("role_permissions")
        .select("permission:permissions(code)")
        .in("role_id", roleIds)

      const permCodes = (rolePerms ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((rp: any) => {
          const perm = rp.permission as unknown as { code: string } | null
          return perm?.code
        })
        .filter(Boolean) as string[]

      setPermissions([...new Set(permCodes)])
      setLoading(false)
    }

    fetchPermissions()
  }, [user, supabase])

  const can = (permission: string) => permissions.includes(permission)

  const canAny = (...perms: string[]) =>
    perms.some((p) => permissions.includes(p))

  const canAll = (...perms: string[]) =>
    perms.every((p) => permissions.includes(p))

  return { permissions, loading, can, canAny, canAll }
}

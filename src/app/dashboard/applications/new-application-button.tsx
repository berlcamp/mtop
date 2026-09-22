"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { usePermissions } from "@/lib/hooks/use-permissions"

/**
 * Filing is the verification officer's job, and the administrator's, so
 * nobody else is offered it. An inspector, assessor, cashier or approver
 * works applications that already exist.
 *
 * Hidden rather than disabled: a disabled button invites the question of how
 * to enable it, and there is no answer short of a different role. The real
 * gate is in createNewFranchiseApplication/createFranchiseTransaction, which
 * re-check the permission server-side.
 */
export function NewApplicationButton() {
  const { can, loading } = usePermissions()

  // Nothing while the roles are still being fetched, so the button doesn't
  // appear and then vanish for someone who was never allowed to use it.
  if (loading || !can("application.create")) return null

  return (
    <Button
      size="sm"
      nativeButton={false}
      render={<Link href="/dashboard/applications/new" />}
    >
      <Plus className="mr-2 h-4 w-4" />
      New Application
    </Button>
  )
}

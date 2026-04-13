import { PageHeader } from "@/components/layout/page-header"
import { getUsers, getRolesAndOffices } from "@/lib/actions/users"
import { UsersContent } from "./users-content"

export default async function AdminUsersPage() {
  const [usersResult, lookups] = await Promise.all([
    getUsers(),
    getRolesAndOffices(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        subtitle="Add and manage users who can access the system"
      />

      <UsersContent
        users={usersResult.data ?? []}
        roles={lookups.roles}
        offices={lookups.offices}
      />
    </div>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { addUser, updateUser, deleteUser } from "@/lib/actions/users"
import { formatDistanceToNow } from "date-fns"

interface Role {
  id: string
  name: string
  code: string
}

interface Office {
  id: string
  name: string
  code: string
}

interface UserEntry {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  office_id: string | null
  created_at: string
  office?: { id: string; name: string; code: string } | null
  user_roles?: { id: string; role_id: string; role: Role }[]
}

export function UsersContent({
  users,
  roles,
  offices,
}: {
  users: UserEntry[]
  roles: Role[]
  offices: Office[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(userId: string, name: string) {
    if (!confirm(`Remove ${name} from the system?`)) return

    const result = await deleteUser(userId)
    if (result.error) {
      setError(result.error)
    } else {
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <AddUserDialog roles={roles} offices={offices} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Office</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-muted-foreground"
                >
                  No users yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.full_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    {user.office ? (
                      <Badge variant="secondary" className="text-xs">
                        {user.office.code}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.user_roles?.map((ur) => (
                        <Badge
                          key={ur.id}
                          variant="outline"
                          className="text-xs"
                        >
                          {ur.role?.name ?? ur.role_id}
                        </Badge>
                      ))}
                      {(!user.user_roles || user.user_roles.length === 0) && (
                        <span className="text-xs text-muted-foreground">
                          No roles
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(user.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <EditUserDialog
                        user={user}
                        roles={roles}
                        offices={offices}
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          handleDelete(user.id, user.full_name)
                        }
                        title="Remove user"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Only users listed here can sign in. When you add a user by email, they
        will be able to log in with their Google account matching that email.
      </p>
    </div>
  )
}

function AddUserDialog({
  roles,
  offices,
}: {
  roles: Role[]
  offices: Office[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [officeId, setOfficeId] = useState("")
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleRole(roleId: string, checked: boolean) {
    setSelectedRoles((prev) =>
      checked ? [...prev, roleId] : prev.filter((r) => r !== roleId)
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !fullName.trim()) {
      setError("Email and name are required.")
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await addUser({
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      office_id: officeId || null,
      role_ids: selectedRoles,
    })

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    setEmail("")
    setFullName("")
    setOfficeId("")
    setSelectedRoles([])
    setOpen(false)
    setSubmitting(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-2 h-4 w-4" />
        Add User
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Add a user by their Google email. They will be able to log in once
              added.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="space-y-2">
              <Label htmlFor="add-email">Google Email</Label>
              <Input
                id="add-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@gmail.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-name">Full Name</Label>
              <Input
                id="add-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Juan Dela Cruz"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-office">Office</Label>
              <select
                id="add-office"
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">No office</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="space-y-2">
                {roles.map((role) => (
                  <div key={role.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={(checked) =>
                        toggleRole(role.id, checked as boolean)
                      }
                    />
                    <Label className="text-sm cursor-pointer">
                      {role.name}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({role.code})
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({
  user,
  roles,
  offices,
}: {
  user: UserEntry
  roles: Role[]
  offices: Office[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState(user.full_name)
  const [officeId, setOfficeId] = useState(user.office_id ?? "")
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    user.user_roles?.map((ur) => ur.role_id) ?? []
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleRole(roleId: string, checked: boolean) {
    setSelectedRoles((prev) =>
      checked ? [...prev, roleId] : prev.filter((r) => r !== roleId)
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) {
      setError("Name is required.")
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await updateUser(user.id, {
      full_name: fullName.trim(),
      office_id: officeId || null,
      role_ids: selectedRoles,
    })

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    setOpen(false)
    setSubmitting(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-office">Office</Label>
              <select
                id="edit-office"
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">No office</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="space-y-2">
                {roles.map((role) => (
                  <div key={role.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={(checked) =>
                        toggleRole(role.id, checked as boolean)
                      }
                    />
                    <Label className="text-sm cursor-pointer">
                      {role.name}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({role.code})
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

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
  Users,
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

      <div className="rounded-xl border border-border/60 overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/60">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Name</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Email</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden md:table-cell">Office</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Roles</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden sm:table-cell">Added</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm font-medium">No users yet</p>
                    <p className="text-xs text-muted-foreground/70">
                      Add a user to get started
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id} className="hover:bg-muted/30 transition-colors border-border/40">
                  <TableCell className="font-semibold text-foreground">
                    {user.full_name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {user.office ? (
                      <Badge variant="secondary" className="text-xs font-medium">
                        {user.office.code}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/50 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.user_roles?.map((ur) => (
                        <Badge
                          key={ur.id}
                          variant="outline"
                          className="text-xs border-primary/20 text-primary/80"
                        >
                          {ur.role?.name ?? ur.role_id}
                        </Badge>
                      ))}
                      {(!user.user_roles || user.user_roles.length === 0) && (
                        <span className="text-xs text-muted-foreground/50">
                          No roles
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                    {formatDistanceToNow(new Date(user.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
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
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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

function FieldGroup({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
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
        <Plus className="h-3.5 w-3.5" />
        Add User
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Add a user by their Google email. They can sign in once added.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-5">
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <FieldGroup label="Google Email" htmlFor="add-email">
              <Input
                id="add-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@gmail.com"
              />
            </FieldGroup>

            <FieldGroup label="Full Name" htmlFor="add-name">
              <Input
                id="add-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Juan Dela Cruz"
              />
            </FieldGroup>

            <FieldGroup label="Office" htmlFor="add-office">
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
            </FieldGroup>

            <FieldGroup label="Roles">
              <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/30 p-3">
                {roles.map((role) => (
                  <div key={role.id} className="flex items-center gap-2.5">
                    <Checkbox
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={(checked) =>
                        toggleRole(role.id, checked as boolean)
                      }
                    />
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium text-foreground">
                        {role.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({role.code})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </FieldGroup>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-5">
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <FieldGroup label="Full Name" htmlFor="edit-name">
              <Input
                id="edit-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup label="Office" htmlFor="edit-office">
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
            </FieldGroup>

            <FieldGroup label="Roles">
              <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/30 p-3">
                {roles.map((role) => (
                  <div key={role.id} className="flex items-center gap-2.5">
                    <Checkbox
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={(checked) =>
                        toggleRole(role.id, checked as boolean)
                      }
                    />
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium text-foreground">
                        {role.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({role.code})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </FieldGroup>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  Search,
  Pencil,
  Power,
  Trash2,
  AlertCircle,
  Users,
  Loader2,
} from "lucide-react"
import {
  getAssociations,
  createAssociation,
  updateAssociation,
  toggleAssociation,
  deleteAssociation,
} from "@/lib/actions/associations"
import { usePermissions } from "@/lib/hooks/use-permissions"
import type { Association } from "@/types/database"

export function AssociationsContent() {
  const { can } = usePermissions()
  const canManage = can("admin.manage")

  const [associations, setAssociations] = useState<Association[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  const fetchAssociations = useCallback(async () => {
    setLoading(true)
    // Admin listing shows deactivated rows too — they still need editing.
    const result = await getAssociations({ search, includeInactive: true })
    if (result.error) setError(result.error)
    else {
      setAssociations(result.data)
      setError(null)
    }
    setLoading(false)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(fetchAssociations, 250)
    return () => clearTimeout(timer)
  }, [fetchAssociations])

  async function handleToggle(association: Association) {
    const result = await toggleAssociation(association.id, !association.is_active)
    if (result.error) setError(result.error)
    else fetchAssociations()
  }

  const activeCount = associations.filter((a) => a.is_active).length

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name or president…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-64 h-8"
          />
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{activeCount}</span>{" "}
            active
            {associations.length !== activeCount && (
              <> · {associations.length - activeCount} inactive</>
            )}
          </p>
          {canManage && <AssociationDialog onSuccess={fetchAssociations} />}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/60">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                Association
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                President
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden sm:table-cell">
                Contact
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                Status
              </TableHead>
              {canManage && <TableHead className="w-[110px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 5 : 4}
                  className="text-center py-12 text-muted-foreground"
                >
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                </TableCell>
              </TableRow>
            ) : associations.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 5 : 4}
                  className="text-center py-16 text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-7 w-7 text-muted-foreground/30" />
                    <p className="text-sm font-medium">
                      {search
                        ? `Nothing matched "${search}"`
                        : "No associations yet"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              associations.map((association) => (
                <TableRow
                  key={association.id}
                  className="hover:bg-muted/30 transition-colors border-border/40"
                >
                  <TableCell className="font-semibold text-foreground">
                    {association.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {association.president_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono hidden sm:table-cell">
                    {association.contact_number ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        association.is_active
                          ? "bg-green-50 text-green-800 ring-1 ring-green-200"
                          : "bg-muted text-muted-foreground ring-1 ring-border"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          association.is_active
                            ? "bg-green-500"
                            : "bg-muted-foreground/40"
                        }`}
                      />
                      {association.is_active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <AssociationDialog
                          association={association}
                          onSuccess={fetchAssociations}
                        />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleToggle(association)}
                          title={
                            association.is_active ? "Deactivate" : "Activate"
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <DeleteAssociationDialog
                          association={association}
                          onSuccess={fetchAssociations}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Deactivating keeps an association on the franchises already registered
        under it but hides it from new applications. Deleting is only possible
        while no franchise uses it.
      </p>
    </div>
  )
}

/** One dialog for both add and edit — an `association` prop means edit. */
function AssociationDialog({
  association,
  onSuccess,
}: {
  association?: Association
  onSuccess: () => void
}) {
  const isEdit = !!association
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(association?.name ?? "")
  const [president, setPresident] = useState(association?.president_name ?? "")
  const [contact, setContact] = useState(association?.contact_number ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      // Reset to the row's current values each time it opens, so a cancelled
      // edit doesn't leak into the next one.
      setName(association?.name ?? "")
      setPresident(association?.president_name ?? "")
      setContact(association?.contact_number ?? "")
      setError(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Association name is required.")
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      name,
      president_name: president,
      contact_number: contact,
    }
    const result = isEdit
      ? await updateAssociation(association.id, payload)
      : await createAssociation(payload)

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setOpen(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isEdit ? (
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              title="Edit"
              className="text-muted-foreground hover:text-foreground"
            />
          }
        >
          <Pencil className="h-3.5 w-3.5" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="mr-2 h-4 w-4" />
          Add Association
        </DialogTrigger>
      )}
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit Association" : "Add Association"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the association's name, president or contact number."
                : "Add a motorcab operators' association that franchises can register under."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-5">
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label
                htmlFor="association-name"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Name
              </Label>
              <Input
                id="association-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. OCHDA"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="association-president"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                President (optional)
              </Label>
              <Input
                id="association-president"
                value={president}
                onChange={(e) => setPresident(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="association-contact"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Contact Number (optional)
              </Label>
              <Input
                id="association-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="09XX-XXX-XXXX"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Association"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteAssociationDialog({
  association,
  onSuccess,
}: {
  association: Association
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setSubmitting(true)
    setError(null)

    const result = await deleteAssociation(association.id)
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setOpen(false)
    onSuccess()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setError(null)
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            title="Delete"
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {association.name}?</DialogTitle>
          <DialogDescription>
            This permanently removes the association. It only works if no
            franchise is registered under it — otherwise deactivate it instead.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 my-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

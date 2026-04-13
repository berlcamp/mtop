"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Upload,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import {
  getNegativeList,
  addToNegativeList,
  updateNegativeListEntry,
  toggleNegativeListEntry,
  bulkAddToNegativeList,
} from "@/lib/actions/negative-list"

const PAGE_SIZE = 20

interface NegativeListEntry {
  id: string
  applicant_name: string
  reason: string
  is_active: boolean
  created_at: string
  added_by_user: { id: string; full_name: string } | null
}

export function NegativeListContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const search = searchParams.get("search") || ""
  const page = parseInt(searchParams.get("page") || "1", 10)

  const [entries, setEntries] = useState<NegativeListEntry[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState(search)
  const [error, setError] = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const result = await getNegativeList({ search, page, pageSize: PAGE_SIZE })
    if (result.error) {
      setError(result.error)
    } else {
      setEntries((result.data as NegativeListEntry[]) ?? [])
      setCount(result.count)
    }
    setLoading(false)
  }, [search, page])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    router.push(`/dashboard/negative-list?${params.toString()}`)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateParams({ search: searchInput, page: "" })
  }

  async function handleToggle(id: string, currentActive: boolean) {
    const result = await toggleNegativeListEntry(id, !currentActive)
    if (result.error) {
      setError(result.error)
    } else {
      fetchEntries()
    }
  }

  const totalPages = Math.ceil(count / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Negative List"
        subtitle="Manage restricted applicants"
        actions={
          <div className="flex gap-2">
            <CsvImportDialog onSuccess={fetchEntries} />
            <AddEntryDialog onSuccess={fetchEntries} />
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 w-64"
          />
        </div>
      </form>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Added By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No entries found.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {entry.applicant_name}
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate">
                    {entry.reason}
                  </TableCell>
                  <TableCell>
                    {entry.added_by_user?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={entry.is_active ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {entry.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <EditEntryDialog
                        entry={entry}
                        onSuccess={fetchEntries}
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          handleToggle(entry.id, entry.is_active)
                        }
                        title={
                          entry.is_active ? "Deactivate" : "Activate"
                        }
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, count)} of {count}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface CsvRow {
  applicant_name: string
  reason: string
  error?: string
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/)
  const results: CsvRow[] = []

  // Detect and skip header row
  const firstLine = lines[0]?.trim().toLowerCase() ?? ""
  const startIdx =
    firstLine.startsWith("name") || firstLine.startsWith("applicant")
      ? 1
      : 0

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Simple CSV split that handles double-quoted fields
    const cols: string[] = []
    let current = ""
    let inQuotes = false
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === "," && !inQuotes) {
        cols.push(current.trim())
        current = ""
      } else {
        current += ch
      }
    }
    cols.push(current.trim())

    const [name, reason] = cols
    if (!name && !reason) continue

    if (!name) {
      results.push({ applicant_name: "", reason: reason ?? "", error: "Name is required" })
    } else if (!reason) {
      results.push({ applicant_name: name, reason: "", error: "Reason is required" })
    } else {
      results.push({ applicant_name: name, reason })
    }
  }

  return results
}

function CsvImportDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<CsvRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setError("Please upload a .csv file.")
      setRows([])
      return
    }
    setError(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setRows(parseCsv(text))
    }
    reader.readAsText(file)
  }

  const validRows = rows.filter((r) => !r.error)
  const invalidRows = rows.filter((r) => !!r.error)

  async function handleImport() {
    if (validRows.length === 0) return
    setSubmitting(true)
    setError(null)
    const res = await bulkAddToNegativeList(validRows)
    setSubmitting(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setResult({ inserted: res.inserted, failed: invalidRows.length })
    onSuccess()
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setRows([])
      setError(null)
      setResult(null)
    }
  }

  function downloadSample() {
    const csv = "name,reason\nJuan dela Cruz,Falsified documents\nMaria Santos,Previous violation"
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "negative-list-sample.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload className="mr-2 h-4 w-4" />
        Import CSV
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with columns <code className="text-xs bg-muted px-1 rounded">name</code> and{" "}
            <code className="text-xs bg-muted px-1 rounded">reason</code>.{" "}
            <button
              type="button"
              onClick={downloadSample}
              className="text-primary underline underline-offset-2 text-sm"
            >
              Download sample
            </button>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                {result.inserted} {result.inserted === 1 ? "entry" : "entries"} imported successfully.
              </div>
              {result.failed > 0 && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <XCircle className="h-4 w-4" />
                  {result.failed} {result.failed === 1 ? "row" : "rows"} skipped due to errors.
                </div>
              )}
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="csv-file">CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="mt-1.5 cursor-pointer"
                />
              </div>

              {rows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Preview — {validRows.length} valid, {invalidRows.length} with errors
                  </p>
                  <div className="rounded-md border max-h-56 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead className="w-20">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row, i) => (
                          <TableRow key={i} className={row.error ? "bg-destructive/5" : undefined}>
                            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                            <TableCell className="text-sm">{row.applicant_name || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                            <TableCell className="text-sm max-w-[220px] truncate">{row.reason || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                            <TableCell>
                              {row.error ? (
                                <span className="text-xs text-destructive">{row.error}</span>
                              ) : (
                                <span className="text-xs text-green-600">OK</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={() => handleOpenChange(false)}>Close</Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={validRows.length === 0 || submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {validRows.length > 0 ? `${validRows.length} entries` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddEntryDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !reason.trim()) {
      setError("Both name and reason are required.")
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await addToNegativeList(name.trim(), reason.trim())
    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    setName("")
    setReason("")
    setOpen(false)
    setSubmitting(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-2 h-4 w-4" />
        Add Entry
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add to Negative List</DialogTitle>
            <DialogDescription>
              Add an applicant to the negative list to block their MTOP
              applications.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="add-name">Applicant Name</Label>
              <Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-reason">Reason</Label>
              <Input
                id="add-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for adding to negative list"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add Entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditEntryDialog({
  entry,
  onSuccess,
}: {
  entry: NegativeListEntry
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(entry.applicant_name)
  const [reason, setReason] = useState(entry.reason)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !reason.trim()) {
      setError("Both name and reason are required.")
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await updateNegativeListEntry(entry.id, {
      applicant_name: name.trim(),
      reason: reason.trim(),
    })

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    setOpen(false)
    setSubmitting(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-xs" />}>
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>
              Update the negative list entry details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Applicant Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-reason">Reason</Label>
              <Input
                id="edit-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
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

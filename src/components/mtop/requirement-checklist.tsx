"use client"

import { useState, useRef } from "react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  ClipboardList,
  Paperclip,
  ExternalLink,
  X,
  Loader2,
  RefreshCw,
  AlertCircle,
  Check,
  ChevronDown,
  SquarePen,
  MessageSquarePlus,
  FileText,
  FilePlus2,
  Download,
} from "lucide-react"
import {
  updateRequirementFileUrl,
  saveRequirementReview,
  updateRequirementsBundle,
  type RequirementReviewChange,
} from "@/lib/actions/requirements"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { REQUIREMENT_KINDS, groupByKind, isBlocking } from "@/lib/requirements"
import { officeDateLabel } from "@/lib/office-time"
import type { ApplicationRequirementWithDetail } from "@/types/database"

const BUCKET = "mtop-documents"

/** Anything larger is almost always an unscaled phone photo. */
const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Extensions the office actually receives. HEIC/HEIF are here because that is
 * what an iPhone camera produces by default — leaving them out made the file
 * picker grey out the clerk's own photos.
 */
const ALLOWED_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]

const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")

/**
 * The bundled folder is one scan of fifteen-odd documents, not one photo of
 * one, so it gets a larger allowance than a per-row attachment — and it is a
 * PDF, because a single JPEG cannot be a folder.
 */
const MAX_BUNDLE_BYTES = 25 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * The storage path of an object, read back out of its public URL, so a
 * replaced or removed file can be deleted instead of being left behind in a
 * public bucket forever.
 */
function storagePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`
  const at = url.indexOf(marker)
  if (at === -1) return null
  const path = url.slice(at + marker.length).split("?")[0]
  return path ? decodeURIComponent(path) : null
}

/**
 * The per-transaction note is the city's own wording for this item on this
 * transaction ("Both the new and the old unit"), so it wins over the
 * catalogue's generic description.
 */
function helperText(item: ApplicationRequirementWithDetail) {
  return item.note || item.description
}

/** The one scanned PDF that covers the whole folder, as stored on the application. */
export interface RequirementsBundle {
  url: string | null
  name: string | null
  size: number | null
  uploadedAt: string | null
}

interface RequirementChecklistProps {
  requirements: ApplicationRequirementWithDetail[]
  applicationId: string
  transactionName?: string
  canVerify: boolean
  bundle: RequirementsBundle
}

/**
 * The checklist as it sits on the application record: every item, read-only,
 * so a clerk can see at a glance which document is still missing without
 * opening anything. Clearing items is a deliberate act done in the dialog,
 * where the whole pass is committed in one save.
 */
export function RequirementChecklist({
  requirements,
  applicationId,
  transactionName,
  canVerify,
  bundle,
}: RequirementChecklistProps) {
  // Held here rather than behind a DialogTrigger so the bundle row can open the
  // same dialog as the header button — an empty bundle is the clerk's first
  // job, and it would be a dead end otherwise.
  const [editing, setEditing] = useState(false)

  // Progress counts only what actually blocks the application. Conditional
  // items ("if applicable") are shown but must never make the bar look stuck.
  const blocking = requirements.filter(isBlocking)
  const blockingDone = blocking.filter((r) => r.is_verified).length
  const optionalDone = requirements.filter(
    (r) => !isBlocking(r) && r.is_verified
  ).length

  const groups = groupByKind(requirements)
  const complete = blocking.length > 0 && blockingDone === blocking.length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Requirements
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">
            {blockingDone} of {blocking.length}
          </span>{" "}
          required items cleared
          {optionalDone > 0 && <> · {optionalDone} optional also cleared</>}
          {transactionName && <> · {transactionName}</>}
        </CardDescription>
        {canVerify && requirements.length > 0 && (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <SquarePen className="mr-1.5" />
              Update checklist
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {requirements.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            This transaction has no checklist items.
          </p>
        ) : (
          <>
            <ProgressBar
              done={blockingDone}
              total={blocking.length}
              complete={complete}
            />

            {/* The folder is the evidence for everything under it, so it sits
                above the list rather than inside the documents group. */}
            {bundle.url ? (
              <BundleRow bundle={bundle}>
                <Button
                  variant="outline"
                  size="xs"
                  nativeButton={false}
                  render={
                    <a
                      href={bundle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <Download className="mr-1" />
                  Open
                </Button>
              </BundleRow>
            ) : (
              canVerify && (
                <BundleEmpty onClick={() => setEditing(true)} />
              )
            )}

            <div className="space-y-5">
              {groups.map((group) => {
                const cleared = group.items.filter((i) => i.is_verified).length
                return (
                  <section key={group.kind} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3 border-b pb-1.5">
                      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {REQUIREMENT_KINDS[group.kind].label}
                      </h3>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {cleared}/{group.items.length}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {group.items.map((item) => (
                        <SummaryRow key={item.id} item={item} />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </CardContent>

      {canVerify && requirements.length > 0 && (
        <RequirementChecklistDialog
          open={editing}
          onOpenChange={setEditing}
          requirements={requirements}
          applicationId={applicationId}
          transactionName={transactionName}
          bundle={bundle}
        />
      )}
    </Card>
  )
}

/**
 * The bundled folder on file. One row, because that is all it is: a file, its
 * size, and when it was put there — enough for a clerk to tell whether what is
 * on record is the folder they scanned.
 */
function BundleRow({
  bundle,
  children,
}: {
  bundle: RequirementsBundle
  children?: React.ReactNode
}) {
  const uploaded = officeDateLabel(bundle.uploadedAt)

  return (
    /* Stacks on a phone: three actions beside a filename left the name showing
       as "DELA …" and its size and date running down four lines. */
    <div className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2.5 ring-1 ring-border sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background ring-1 ring-border">
          <FileText className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {bundle.name || "Scanned folder"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              bundle.size ? formatBytes(bundle.size) : null,
              uploaded ? `added ${uploaded}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Covers every document below"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:ml-auto">
        {children}
      </div>
    </div>
  )
}

function BundleEmpty({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left transition-colors hover:border-solid hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground">
        <FilePlus2 className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Attach the scanned folder</p>
        <p className="text-xs text-muted-foreground">
          One PDF covering every document below, instead of a file per row.
        </p>
      </div>
    </button>
  )
}

function ProgressBar({
  done,
  total,
  complete,
}: {
  done: number
  total: number
  complete: boolean
}) {
  const pct = total > 0 ? (done / total) * 100 : 100
  return (
    <div
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label="Required items cleared"
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted ring-1 ring-foreground/5 ring-inset"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          complete ? "bg-green-600" : "bg-primary"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/**
 * The status marker carries the row's whole state, so the eye can run down the
 * left edge and stop only where something is outstanding: green for cleared,
 * amber for a mandatory item still missing, and a quiet hollow ring for one
 * that is only wanted if it applies.
 */
function StatusMark({
  verified,
  blocking,
}: {
  verified: boolean
  blocking: boolean
}) {
  if (verified) {
    return (
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
        <Check className="size-2.5" strokeWidth={3.5} />
        <span className="sr-only">Cleared</span>
      </span>
    )
  }
  return (
    <span
      className={cn(
        "mt-0.5 size-4 shrink-0 rounded-full border-2",
        blocking ? "border-amber-400 bg-amber-50" : "border-border"
      )}
    >
      <span className="sr-only">Pending</span>
    </span>
  )
}

function SummaryRow({ item }: { item: ApplicationRequirementWithDetail }) {
  const verified = item.is_verified
  const blocking = isBlocking(item)
  const helper = helperText(item)

  return (
    <li className="flex items-start gap-2.5">
      <StatusMark verified={verified} blocking={blocking} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/* Only a mandatory item still missing keeps full contrast. A
              cleared one is done and an "if applicable" one never blocks, so
              both recede and the amber marks are the only thing left to scan
              for. */}
          <span
            className={cn(
              "text-sm leading-snug",
              !verified && blocking ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {item.label}
          </span>
          {item.is_conditional && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[0.6875rem] leading-tight text-muted-foreground">
              If applicable
            </span>
          )}
        </div>
        {!verified && helper && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {helper}
          </p>
        )}
        {item.remarks && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            <span aria-hidden className="mr-1 text-muted-foreground/60">
              ↳
            </span>
            {item.remarks}
          </p>
        )}
      </div>

      {item.file_url && (
        <a
          href={item.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-px flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Paperclip className="size-3" />
          <span className="sr-only sm:not-sr-only">File</span>
        </a>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------------- */
/* Editing dialog                                                            */
/* ------------------------------------------------------------------------- */

type Draft = { verified: boolean; remarks: string }

function buildDraft(items: ApplicationRequirementWithDetail[]) {
  return Object.fromEntries(
    items.map((i) => [
      i.id,
      { verified: i.is_verified, remarks: i.remarks ?? "" } satisfies Draft,
    ])
  )
}

/**
 * Ticks and remarks are held here until Save, so a pass through a fourteen-item
 * checklist is one request rather than fourteen, and Cancel means something.
 *
 * Attachments are the exception and upload the moment they are chosen: the file
 * has to reach storage before the row can point at it, and there is no honest
 * way to roll that back from a Cancel. The dialog says so rather than pretending
 * otherwise.
 */
function RequirementChecklistDialog({
  open,
  onOpenChange,
  requirements,
  applicationId,
  transactionName,
  bundle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requirements: ApplicationRequirementWithDetail[]
  applicationId: string
  transactionName?: string
  bundle: RequirementsBundle
}) {
  const [draft, setDraft] = useState<Record<string, Draft>>(() =>
    buildDraft(requirements)
  )
  // Attachment changes commit immediately, so the dialog keeps its own view of
  // each row's file rather than waiting for the record behind it to refresh.
  const [fileUrls, setFileUrls] = useState<Record<string, string | null>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Opening a dialog focuses its first control, which put a focus ring on a
  // collapsed group header. The scrolling list takes it instead, so the arrow
  // keys move the checklist the moment it opens.
  const scrollRef = useRef<HTMLDivElement>(null)

  const groups = groupByKind(requirements)

  const changes: RequirementReviewChange[] = requirements.flatMap((item) => {
    const d = draft[item.id]
    if (!d) return []
    const change: RequirementReviewChange = { id: item.id }
    let touched = false
    if (d.verified !== item.is_verified) {
      change.is_verified = d.verified
      touched = true
    }
    if (d.remarks !== (item.remarks ?? "")) {
      change.remarks = d.remarks
      touched = true
    }
    return touched ? [change] : []
  })

  const dirty = changes.length > 0

  const blocking = requirements.filter(isBlocking)
  const blockingDone = blocking.filter((i) => draft[i.id]?.verified).length

  // Always open on what is currently on record, never on an abandoned draft.
  // Re-synced during render rather than in an effect, the way the rest of this
  // file picks up server values.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(buildDraft(requirements))
      setFileUrls({})
      // A group that is already fully cleared starts folded away, so the
      // dialog opens on the work that is actually left.
      setCollapsed(
        Object.fromEntries(
          groupByKind(requirements).map((g) => [
            g.kind,
            g.items.every((i) => i.is_verified),
          ])
        )
      )
      setError(null)
      setConfirmDiscard(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true)
      return
    }

    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    onOpenChange(false)
  }

  function setRow(id: string, patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    setConfirmDiscard(false)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    const result = await saveRequirementReview(applicationId, changes)

    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }

    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* `grid-cols-[minmax(0,1fr)]` is load-bearing: without an explicit
          column the grid sizes to its widest child's max-content and the whole
          dialog runs off the right edge of a phone. */}
      <DialogContent
        className="grid max-h-[min(50rem,90vh)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-2xl"
        initialFocus={scrollRef}
      >
        <DialogHeader className="gap-2 border-b pb-4">
          <DialogTitle>Update requirements</DialogTitle>
          <DialogDescription>
            {transactionName && <>{transactionName} · </>}Ticks and remarks save
            when you press Save; attached files upload straight away.
          </DialogDescription>
          <div className="flex items-center gap-3 pt-1">
            <ProgressBar
              done={blockingDone}
              total={blocking.length}
              complete={blocking.length > 0 && blockingDone === blocking.length}
            />
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {blockingDone}/{blocking.length}
            </span>
          </div>
        </DialogHeader>

        <div
          ref={scrollRef}
          tabIndex={-1}
          className="-mx-5 min-h-0 overflow-y-auto px-5 py-4 outline-none"
        >
          <section className="mb-5">
            <h3 className="border-b py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Scanned folder
            </h3>
            <p className="pt-2 text-xs text-muted-foreground">
              One PDF of everything the operator handed over. Attach it here
              rather than a file per row.
            </p>
            <div className="mt-2">
              <BundleUploader
                applicationId={applicationId}
                bundle={bundle}
                disabled={saving}
              />
            </div>
          </section>

          <div className="space-y-5">
            {groups.map((group) => {
              const isCollapsed = collapsed[group.kind]
              const cleared = group.items.filter(
                (i) => draft[i.id]?.verified
              ).length
              return (
                <section key={group.kind}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => ({
                        ...prev,
                        [group.kind]: !prev[group.kind],
                      }))
                    }
                    aria-expanded={!isCollapsed}
                    className="group/head flex w-full items-center gap-2 rounded-md border-b py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                        isCollapsed && "-rotate-90"
                      )}
                    />
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {REQUIREMENT_KINDS[group.kind].label}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {cleared}/{group.items.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <>
                      <p className="pt-2 pl-5.5 text-xs text-muted-foreground">
                        {REQUIREMENT_KINDS[group.kind].hint}
                      </p>
                      <div className="mt-2 space-y-2">
                        {group.items.map((item) => (
                          <EditableRow
                            key={item.id}
                            item={item}
                            applicationId={applicationId}
                            draft={draft[item.id]}
                            fileUrl={
                              item.id in fileUrls
                                ? fileUrls[item.id]
                                : item.file_url
                            }
                            onFileUrl={(url) =>
                              setFileUrls((prev) => ({
                                ...prev,
                                [item.id]: url,
                              }))
                            }
                            onChange={(patch) => setRow(item.id, patch)}
                            disabled={saving}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )
            })}
          </div>
        </div>

        <DialogFooter className="flex-col! items-stretch gap-3 sm:flex-row! sm:items-center">
          {error && (
            <p className="flex items-start gap-1.5 text-xs text-destructive sm:mr-auto">
              <AlertCircle className="mt-px size-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          {!error &&
            (confirmDiscard ? (
              <p className="text-xs text-foreground sm:mr-auto">
                Discard {changes.length} unsaved{" "}
                {changes.length === 1 ? "change" : "changes"}?
              </p>
            ) : (
              <p className="text-xs text-muted-foreground sm:mr-auto">
                {dirty
                  ? `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}`
                  : "No changes yet"}
              </p>
            ))}

          <div className="flex gap-2 *:flex-1 sm:*:flex-none">
            {confirmDiscard ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setConfirmDiscard(false)}
                >
                  Keep editing
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => onOpenChange(false)}
                >
                  Discard
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!dirty || saving}>
                  {saving && <Loader2 className="mr-1.5 animate-spin" />}
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Upload, replace or remove the bundled folder.
 *
 * Like the per-row attachments this commits the moment a file is chosen: the
 * PDF has to reach storage before the application can point at it, and there
 * is no honest way to roll that back out of a Cancel. The dialog's header says
 * so.
 */
function BundleUploader({
  applicationId,
  bundle,
  disabled,
}: {
  applicationId: string
  bundle: RequirementsBundle
  disabled: boolean
}) {
  // Mirrors the stored bundle so a fresh upload shows immediately, and is
  // re-synced during render whenever the record behind it moves on.
  const [server, setServer] = useState(bundle)
  const [current, setCurrent] = useState(bundle)
  if (bundle !== server) {
    setServer(bundle)
    setCurrent(bundle)
  }

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (ext !== "pdf") {
      setError(
        `That's a ${ext ? `.${ext}` : "n unrecognised"} file. The scanned folder is a single PDF of every document — scan them together, or attach that one file to its own checklist item below.`
      )
      if (inputRef.current) inputRef.current.value = ""
      return
    }

    if (file.size > MAX_BUNDLE_BYTES) {
      setError(
        `That file is ${formatBytes(file.size)}. The scanned folder is limited to ${MAX_BUNDLE_BYTES / 1024 / 1024} MB — scan it in black and white or at a lower resolution.`
      )
      if (inputRef.current) inputRef.current.value = ""
      return
    }

    setBusy(true)
    setError(null)
    const previousUrl = current.url

    try {
      const supabase = createClient()
      // Unique per upload, for the same reason the per-row attachments are: a
      // reused path keeps serving the browser's cached copy of the old scan.
      const path = `${applicationId}/requirements-${Date.now()}.pdf`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "application/pdf" })

      if (uploadErr) {
        setError(uploadErr.message)
        return
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const publicUrl = data.publicUrl

      const result = await updateRequirementsBundle(applicationId, {
        url: publicUrl,
        name: file.name,
        size: file.size,
      })

      if (result.error) {
        // The application still points where it did, so drop what we just
        // uploaded rather than leaving it orphaned in a public bucket.
        await supabase.storage.from(BUCKET).remove([path])
        setError(result.error)
        return
      }

      setCurrent({
        url: publicUrl,
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      })

      // Only once the row is safely repointed is the old scan removed.
      if (previousUrl) {
        const previousPath = storagePathFromUrl(previousUrl)
        if (previousPath) {
          await supabase.storage.from(BUCKET).remove([previousPath])
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleRemove() {
    if (!current.url) return

    setBusy(true)
    setError(null)

    try {
      const result = await updateRequirementsBundle(applicationId, null)
      if (result.error) {
        setError(result.error)
        return
      }

      // This bucket is public, so clearing the columns is not enough — the PDF
      // stays downloadable to anyone holding the URL until the object is gone.
      const path = storagePathFromUrl(current.url)
      if (path) {
        await createClient().storage.from(BUCKET).remove([path])
      }

      setCurrent({ url: null, name: null, size: null, uploadedAt: null })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      accept=".pdf,application/pdf"
      onChange={handleChange}
    />
  )

  return (
    <div className="space-y-1.5">
      {current.url ? (
        <BundleRow bundle={current}>
          {input}
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            nativeButton={false}
            render={
              <a href={current.url} target="_blank" rel="noopener noreferrer" />
            }
          >
            <ExternalLink className="mr-1" />
            View
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => inputRef.current?.click()}
            disabled={busy || disabled}
          >
            {busy ? (
              <Loader2 className="mr-1 animate-spin" />
            ) : (
              <RefreshCw className="mr-1" />
            )}
            {busy ? "Uploading…" : "Replace"}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
            disabled={busy || disabled}
            title="Remove the scanned folder"
          >
            <X />
            <span className="sr-only">Remove the scanned folder</span>
          </Button>
        </BundleRow>
      ) : (
        <>
          {input}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || disabled}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left transition-colors hover:border-solid hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground">
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FilePlus2 className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {busy ? "Uploading…" : "Choose a PDF"}
              </p>
              <p className="text-xs text-muted-foreground">
                Up to {MAX_BUNDLE_BYTES / 1024 / 1024} MB.
              </p>
            </div>
          </button>
        </>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

function EditableRow({
  item,
  applicationId,
  draft,
  fileUrl,
  onFileUrl,
  onChange,
  disabled,
}: {
  item: ApplicationRequirementWithDetail
  applicationId: string
  draft: Draft
  fileUrl: string | null
  onFileUrl: (url: string | null) => void
  onChange: (patch: Partial<Draft>) => void
  disabled: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRemarks, setShowRemarks] = useState(draft.remarks.length > 0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const acceptsFile = REQUIREMENT_KINDS[item.kind].acceptsFile
  const helper = helperText(item)
  const changed =
    draft.verified !== item.is_verified || draft.remarks !== (item.remarks ?? "")

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(
        `${ext ? `.${ext} files` : "That file"} can't be attached. Use a PDF or a photo (${ALLOWED_EXTENSIONS.join(", ")}).`
      )
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    if (file.size > MAX_FILE_BYTES) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Attachments are limited to ${MAX_FILE_BYTES / 1024 / 1024} MB — photograph the document at a lower resolution, or scan it as a PDF.`
      )
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    setUploading(true)
    setError(null)
    const previousUrl = fileUrl

    try {
      const supabase = createClient()
      // A unique name per upload. The old scheme reused
      // `<application>/<item>.<ext>` with upsert, so replacing a scan produced
      // the identical URL and the browser kept serving the cached old file —
      // the clerk fixed the attachment and saw no change.
      const path = `${applicationId}/${item.id}-${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined })

      if (uploadErr) {
        setError(uploadErr.message)
        return
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const publicUrl = data.publicUrl

      const result = await updateRequirementFileUrl(
        item.id,
        applicationId,
        publicUrl
      )

      if (result.error) {
        // The row still points at whatever it pointed at before, so drop the
        // object we just uploaded rather than leaving it orphaned.
        await supabase.storage.from(BUCKET).remove([path])
        setError(result.error)
        return
      }

      onFileUrl(publicUrl)

      // Only once the row is safely repointed is the old file removed.
      if (previousUrl) {
        const previousPath = storagePathFromUrl(previousUrl)
        if (previousPath) {
          await supabase.storage.from(BUCKET).remove([previousPath])
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleRemoveFile() {
    if (!fileUrl) return

    setUploading(true)
    setError(null)

    try {
      const result = await updateRequirementFileUrl(item.id, applicationId, null)
      if (result.error) {
        setError(result.error)
        return
      }

      // Clearing the column used to be the whole operation, which left the
      // document downloadable by anyone holding the URL — this bucket is public.
      const path = storagePathFromUrl(fileUrl)
      if (path) {
        await createClient().storage.from(BUCKET).remove([path])
      }

      onFileUrl(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 ring-1 transition-colors",
        changed
          ? "bg-primary/[0.04] ring-primary/25"
          : draft.verified
            ? "bg-muted/40 ring-border"
            : "ring-border"
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={item.id}
          className="mt-0.5"
          checked={draft.verified}
          onCheckedChange={(checked) =>
            onChange({ verified: checked as boolean })
          }
          disabled={disabled}
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Label
              htmlFor={item.id}
              className="cursor-pointer text-sm leading-snug"
            >
              {item.label}
            </Label>
            {item.is_conditional && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[0.6875rem] leading-tight text-muted-foreground">
                If applicable
              </span>
            )}
          </div>

          {helper && (
            <p className="text-xs leading-snug text-muted-foreground">
              {helper}
            </p>
          )}

          {/* One row of actions, not two. Only kinds evidenced by a file get
              the attachment controls — a personal appearance or a surrendered
              plate is confirmed, not uploaded. */}
          {(acceptsFile || !showRemarks) && (
            <div className="flex flex-wrap items-center gap-1">
              {acceptsFile && (
                <>
                  {fileUrl && (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mr-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-primary underline-offset-2 transition-colors hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <ExternalLink className="size-3" />
                      View file
                    </a>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={ACCEPT_ATTRIBUTE}
                    onChange={handleFileChange}
                  />
                  {/* Replacing used to mean removing first and attaching again
                      — two steps, with the row briefly holding no evidence at
                      all. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || disabled}
                  >
                    {uploading ? (
                      <Loader2 className="mr-1 animate-spin" />
                    ) : fileUrl ? (
                      <RefreshCw className="mr-1" />
                    ) : (
                      <Paperclip className="mr-1" />
                    )}
                    {uploading
                      ? "Uploading…"
                      : fileUrl
                        ? "Replace file"
                        : "Attach file"}
                  </Button>

                  {fileUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={handleRemoveFile}
                      disabled={uploading || disabled}
                      title="Remove file"
                    >
                      <X />
                      <span className="sr-only">Remove file</span>
                    </Button>
                  )}
                </>
              )}

              {acceptsFile && !showRemarks && (
                <span
                  aria-hidden
                  className="mx-1 h-3.5 w-px shrink-0 bg-border"
                />
              )}

              {!showRemarks && (
                <RemarkButton onClick={() => setShowRemarks(true)} />
              )}
            </div>
          )}

          {/* A remark is the exception, not the rule, so it stays folded away
              until there is one to write. Twenty always-open text boxes made
              the checklist unreadable. */}
          {showRemarks && (
            <Input
              autoFocus={draft.remarks.length === 0}
              placeholder="Remarks (optional)"
              value={draft.remarks}
              onChange={(e) => onChange({ remarks: e.target.value })}
              onBlur={() => {
                if (draft.remarks.length === 0) setShowRemarks(false)
              }}
              className="h-7 text-xs"
              disabled={disabled}
            />
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-px size-3 shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function RemarkButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="text-muted-foreground"
      onClick={onClick}
    >
      <MessageSquarePlus className="mr-1" />
      Add remark
    </Button>
  )
}

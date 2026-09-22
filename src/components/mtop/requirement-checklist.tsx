"use client"

import { useState, useTransition, useRef } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ClipboardList,
  Paperclip,
  ExternalLink,
  X,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import {
  verifyRequirement,
  updateRequirementRemarks,
  updateRequirementFileUrl,
} from "@/lib/actions/requirements"
import { createClient } from "@/lib/supabase/client"
import { REQUIREMENT_KINDS, groupByKind, isBlocking } from "@/lib/requirements"
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

interface RequirementChecklistProps {
  requirements: ApplicationRequirementWithDetail[]
  applicationId: string
  transactionName?: string
  canVerify: boolean
}

export function RequirementChecklist({
  requirements,
  applicationId,
  transactionName,
  canVerify,
}: RequirementChecklistProps) {
  // Progress counts only what actually blocks the application. Conditional
  // items ("if applicable") are shown but must never make the bar look stuck.
  const blocking = requirements.filter(isBlocking)
  const blockingDone = blocking.filter((r) => r.is_verified).length
  const optionalDone = requirements.filter(
    (r) => !isBlocking(r) && r.is_verified
  ).length

  const groups = groupByKind(requirements)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Requirements
        </CardTitle>
        <CardDescription>
          <span className="font-medium">
            {blockingDone}/{blocking.length}
          </span>{" "}
          required items cleared
          {optionalDone > 0 && (
            <> · {optionalDone} optional item(s) also cleared</>
          )}
          {transactionName && <> · {transactionName}</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5">
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{
                width: `${blocking.length > 0 ? (blockingDone / blocking.length) * 100 : 100}%`,
              }}
            />
          </div>
        </div>

        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.kind} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">
                  {REQUIREMENT_KINDS[group.kind].label}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {REQUIREMENT_KINDS[group.kind].hint}
                </p>
              </div>

              <div className="space-y-3">
                {group.items.map((item) => (
                  <RequirementRow
                    key={item.id}
                    item={item}
                    applicationId={applicationId}
                    canVerify={canVerify}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function RequirementRow({
  item,
  applicationId,
  canVerify,
}: {
  item: ApplicationRequirementWithDetail
  applicationId: string
  canVerify: boolean
}) {
  // Verifying and saving remarks get their own transitions: sharing one meant
  // a debounced remarks save disabled the checkbox, and vice versa.
  const [verifyPending, startVerify] = useTransition()
  const [remarksPending, startRemarks] = useTransition()

  // The tick has to land the moment it is clicked — waiting for the round trip
  // and the RSC refresh to come back reads as a broken checkbox. This mirrors
  // item.is_verified and is re-synced during render whenever the server sends a
  // different value, so it can't drift; a rejected write is rolled back by hand
  // in handleVerify. (useOptimistic drops its value the moment the transition
  // ends, which shows as a flicker if the refresh lands a beat later.)
  const [serverVerified, setServerVerified] = useState(item.is_verified)
  const [verified, setVerified] = useState(item.is_verified)
  if (item.is_verified !== serverVerified) {
    setServerVerified(item.is_verified)
    setVerified(item.is_verified)
  }

  const [remarksValue, setRemarksValue] = useState(item.remarks ?? "")
  const [remarksSaved, setRemarksSaved] = useState(false)
  const remarksTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedRemarks = useRef(item.remarks ?? "")

  // Mirror of item.file_url that can be adjusted while an upload is in flight.
  // Re-synced during render (not in an effect) whenever the server sends a
  // different value, so another clerk's attachment isn't masked by stale state.
  const [serverFileUrl, setServerFileUrl] = useState(item.file_url)
  const [fileUrl, setFileUrl] = useState(item.file_url)
  if (item.file_url !== serverFileUrl) {
    setServerFileUrl(item.file_url)
    setFileUrl(item.file_url)
  }

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const acceptsFile = REQUIREMENT_KINDS[item.kind].acceptsFile
  const busy = verifyPending || uploading

  function handleVerify(checked: boolean) {
    setError(null)
    setVerified(checked)
    startVerify(async () => {
      const result = await verifyRequirement(item.id, applicationId, checked)
      // Previously the result was discarded, so a rejected write left the row
      // silently snapping back with nothing said about why.
      if (result?.error) {
        setVerified(!checked)
        setError(result.error)
      }
    })
  }

  function saveRemarks(value: string) {
    if (value === savedRemarks.current) return
    startRemarks(async () => {
      const result = await updateRequirementRemarks(
        item.id,
        applicationId,
        value
      )
      if (result?.error) {
        setError(result.error)
        return
      }
      savedRemarks.current = value
      setRemarksSaved(true)
    })
  }

  function handleRemarksChange(value: string) {
    setRemarksValue(value)
    setRemarksSaved(false)
    setError(null)

    if (remarksTimer.current) clearTimeout(remarksTimer.current)
    remarksTimer.current = setTimeout(() => saveRemarks(value), 800)
  }

  // Typing pauses of under 800ms used to be fine, but leaving the field (to
  // forward the application, say) dropped whatever hadn't been flushed yet.
  function handleRemarksBlur() {
    if (remarksTimer.current) clearTimeout(remarksTimer.current)
    saveRemarks(remarksValue)
  }

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

      setFileUrl(publicUrl)

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

      setFileUrl(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  // The per-transaction note is the city's own wording for this item on this
  // transaction ("Both the new and the old unit"), so it wins over the
  // catalogue's generic description.
  const helper = item.note || item.description

  return (
    <div className="rounded-lg border px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {canVerify ? (
            <>
              <Checkbox
                id={item.id}
                className="mt-0.5"
                checked={verified}
                onCheckedChange={(checked) => handleVerify(checked as boolean)}
                disabled={verifyPending}
              />
              <div className="min-w-0">
                <Label
                  htmlFor={item.id}
                  className="text-sm cursor-pointer leading-snug"
                >
                  {item.label}
                </Label>
                {helper && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {helper}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="min-w-0">
              <span className="text-sm leading-snug">{item.label}</span>
              {helper && (
                <p className="text-xs text-muted-foreground mt-0.5">{helper}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {item.is_conditional && (
            <Badge variant="outline" className="text-xs">
              If applicable
            </Badge>
          )}
          <Badge
            variant={verified ? "default" : "secondary"}
            className="text-xs"
          >
            {verified ? "Cleared" : "Pending"}
          </Badge>
        </div>
      </div>

      {/* File attachment row. Only kinds that are evidenced by a file get one —
          a personal appearance or a surrendered plate is confirmed, not uploaded.
          Add/replace/remove is gated on canVerify; everyone with view access can
          still open an already-attached file. */}
      {acceptsFile && (fileUrl || canVerify) && (
        <div className="flex flex-wrap items-center gap-2 pl-7">
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View file
            </a>
          )}

          {canVerify && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ACCEPT_ATTRIBUTE}
                onChange={handleFileChange}
              />
              {/* Replacing used to mean removing first and attaching again —
                  two steps, with the row briefly holding no evidence at all. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : fileUrl ? (
                  <RefreshCw className="mr-1 h-3 w-3" />
                ) : (
                  <Paperclip className="mr-1 h-3 w-3" />
                )}
                {uploading
                  ? "Uploading…"
                  : fileUrl
                    ? "Replace file"
                    : "Attach file"}
              </Button>
            </>
          )}

          {canVerify && fileUrl && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-destructive"
              onClick={handleRemoveFile}
              disabled={uploading}
              title="Remove file"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive pl-7">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {canVerify && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Remarks (optional)"
            value={remarksValue}
            onChange={(e) => handleRemarksChange(e.target.value)}
            onBlur={handleRemarksBlur}
            className="text-xs h-7"
            // Deliberately never disabled: it used to lock mid-sentence when
            // the debounce fired, taking the caret with it.
          />
          <span className="text-xs text-muted-foreground w-12 shrink-0">
            {remarksPending ? "Saving…" : remarksSaved ? "Saved" : ""}
          </span>
        </div>
      )}

      {!canVerify && item.remarks && (
        <p className="text-xs text-muted-foreground pl-7">{item.remarks}</p>
      )}

      {busy && <span className="sr-only">Saving…</span>}
    </div>
  )
}
